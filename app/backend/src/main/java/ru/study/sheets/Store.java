package ru.study.sheets;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.security.crypto.bcrypt.BCrypt;
import org.springframework.beans.factory.annotation.Value;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.security.SecureRandom;
import java.nio.charset.StandardCharsets;

@Service
public class Store {
 private final JdbcTemplate db;private final ObjectMapper json;private final SheetEngine engine;
 private final ConcurrentHashMap<String,long[]> attempts=new ConcurrentHashMap<>();
 @Value("${AUTH_LIMIT:30}") private int authLimit;
 public Store(JdbcTemplate db,ObjectMapper json,SheetEngine engine){this.db=db;this.json=json;this.engine=engine;}
 public String encode(Object value){try{return json.writeValueAsString(value);}catch(Exception e){throw new IllegalArgumentException(e);}}
 @SuppressWarnings("unchecked") public Map<String,Object> decode(String value){try{return json.readValue(value,Map.class);}catch(Exception e){throw new IllegalArgumentException(e);}}
 private List<Map<String,Object>> rows(String sql,Object...args){
  var list=db.queryForList(sql,args);
  for(var row:list)for(String key:List.of("state","changes","cursor"))if(row.get(key)!=null)row.put(key,decode(row.get(key).toString()));
  return list;
 }
 private Map<String,Object> first(String sql,Object...args){var result=rows(sql,args);return result.isEmpty()?null:result.getFirst();}
 public Map<String,Object> user(String token){if(token==null)return null;return first("select u.id,u.email,u.name from ss_users u join ss_sessions s on s.user_id=u.id where s.token=? and s.expires>?",token,System.currentTimeMillis());}
 private Map<String,Object> requireUser(String token){var user=user(token);if(user==null)throw new ApiException(401,"Войдите в аккаунт");return user;}
 public String role(String document,Map<String,Object> user){
  var doc=first("select owner from ss_documents where id=?",document);if(doc==null)return null;
  if(doc.get("owner").equals(user.get("id")))return "owner";
  var permission=first("select role from ss_permissions where document_id=? and email=?",document,user.get("email"));return permission==null?null:permission.get("role").toString();
 }
 private String access(String id,Map<String,Object> user){String role=role(id,user);if(role==null)throw new ApiException(403,"Нет доступа к этой таблице");return role;}
 public record Login(String token,Map<String,Object> user){}
 @Transactional public Login login(String action,Map<String,Object> input,String ip){
  long now=System.currentTimeMillis();attempts.entrySet().removeIf(e->e.getValue()[1]<now);
  long[] rate=attempts.compute(ip,(key,value)->value==null?new long[]{1,now+60000}:new long[]{value[0]+1,value[1]});
  if(rate[0]>authLimit)throw new ApiException(429,"Слишком много попыток. Попробуйте через минуту.");
  String email=Objects.toString(input.get("email"),"").trim().toLowerCase(Locale.ROOT),password=Objects.toString(input.get("password"),"");
  if(!email.matches("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$")||email.length()>254||password.length()<8||password.length()>128)throw new ApiException(400,"Введите email и пароль длиной от 8 до 128 символов");
  Map<String,Object> user;
  if(action.equals("register")){
   String name=Objects.toString(input.get("name"),"").trim();if(name.isEmpty()||name.length()>80)throw new ApiException(400,"Введите ваше имя");
   if(first("select id from ss_users where email=?",email)!=null)throw new ApiException(409,"Этот email уже зарегистрирован");
   String id=UUID.randomUUID().toString();db.update("insert into ss_users values(?,?,?,?)",id,email,name,BCrypt.hashpw(bcryptInput(password),BCrypt.gensalt(12)));
   user=new LinkedHashMap<>(Map.of("id",id,"email",email,"name",name));
  }else if(action.equals("login")){
   user=first("select * from ss_users where email=?",email);
   if(user==null||!BCrypt.checkpw(bcryptInput(password),user.get("password").toString()))throw new ApiException(401,"Неверный email или пароль");
   user.remove("password");
  }else throw new ApiException(404,"Неизвестное действие");
  byte[] bytes=new byte[32];new SecureRandom().nextBytes(bytes);String token=HexFormat.of().formatHex(bytes);
  db.update("insert into ss_sessions values(?,?,?)",token,user.get("id"),now+30L*86400000);
  return new Login(token,user);
 }
 // bcryptjs uses only the first 72 UTF-8 bytes. Preserve compatibility with existing accounts.
 private byte[] bcryptInput(String password){byte[] bytes=password.getBytes(StandardCharsets.UTF_8);return bytes.length<=72?bytes:Arrays.copyOf(bytes,72);}
 @Transactional public void logout(String token){requireUser(token);db.update("delete from ss_sessions where token=?",token);}
 public Object documents(String token){var user=requireUser(token);return rows("select distinct d.id,d.title,d.updated,d.owner,u.name as \"ownerName\" from ss_documents d join ss_users u on u.id=d.owner left join ss_permissions p on p.document_id=d.id where d.owner=? or p.email=? order by d.updated desc",user.get("id"),user.get("email"));}
 @Transactional public Map<String,Object> create(String token){
  var user=requireUser(token);String id=UUID.randomUUID().toString();long now=System.currentTimeMillis();
  var state=Map.of("sheets",List.of(Map.of("id",UUID.randomUUID().toString(),"name","Лист1","cells",Map.of(),"widths",Map.of(),"rows",1000,"cols",26,"frozen",0)),"comments",List.of());
  db.update("insert into ss_documents(id,owner,title,state,updated) values(?,?,?,?::jsonb,?)",id,user.get("id"),"Новая таблица",encode(state),now);
  db.update("insert into ss_versions values(?,0,?,?,?::jsonb,?)",id,user.get("id"),"Новая таблица",encode(state),now);
  return document(token,id);
 }
 private Map<String,Object> rawDocument(String id,boolean lock){
  var doc=first("select id,owner,title,state,revision,updated,structure_revision as \"structureRevision\",change_type as \"changeType\" from ss_documents where id=?"+(lock?" for update":""),id);
  if(doc==null)throw new ApiException(404,"Таблица не найдена");return doc;
 }
 public Map<String,Object> document(String token,String id){var user=requireUser(token);String role=access(id,user);var doc=rawDocument(id,false);doc.put("role",role);return doc;}
 public Object members(String token,String id){var user=requireUser(token);access(id,user);var doc=rawDocument(id,false);return Map.of("owner",first("select id,email,name from ss_users where id=?",doc.get("owner")),"members",rows("select p.email,p.role,u.name from ss_permissions p left join ss_users u on u.email=p.email where p.document_id=?",id));}
 @Transactional public void member(String token,String id,Map<String,Object> input){
  var user=requireUser(token);rawDocument(id,true);if(!access(id,user).equals("owner"))throw new ApiException(403,"Только владелец может управлять доступом");
  String email=Objects.toString(input.get("email"),"").trim().toLowerCase(Locale.ROOT),role=Objects.toString(input.get("role"),"");
  if(!email.matches("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$")||email.length()>254||!List.of("viewer","commenter","editor","remove").contains(role))throw new ApiException(400,"Проверьте email и роль");
  if(user.get("email").equals(email))throw new ApiException(400,"Нельзя изменить роль владельца");
  if(role.equals("remove"))db.update("delete from ss_permissions where document_id=? and email=?",id,email);
  else db.update("insert into ss_permissions values(?,?,?) on conflict(document_id,email) do update set role=excluded.role",id,email,role);
  if(role.equals("remove"))db.update("delete from ss_presence where document_id=? and user_id in(select id from ss_users where email=?)",id,email);
 }
 public Object history(String token,String id){
  access(id,requireUser(token));var history=rows("select h.revision,h.created,u.name,h.changes,case when exists(select 1 from ss_versions v where v.document_id=h.document_id and v.revision=h.revision) then 1 else 0 end restorable from ss_history h join ss_users u on u.id=h.user_id where h.document_id=? order by h.id desc limit 100",id);
  var initial=first("select v.revision,v.created,u.name from ss_versions v join ss_users u on u.id=v.user_id where v.document_id=? and v.revision=0",id);
  if(initial!=null){initial.put("restorable",1);initial.put("changes",Map.of("type","create"));history.add(initial);}return history;
 }
 public Map<String,Object> version(String token,String id,long revision){access(id,requireUser(token));if(revision<0)throw new ApiException(400,"Неверная версия");return rawVersion(id,revision);}
 private Map<String,Object> rawVersion(String id,long revision){var value=first("select revision,title,state,created from ss_versions where document_id=? and revision=?",id,revision);if(value==null)throw new ApiException(404,"Эта версия недоступна для восстановления");return value;}
 @Transactional public Object operation(String token,String id,Map<String,Object> input){
  var user=requireUser(token);var doc=rawDocument(id,true);String role=access(id,user);
  String requestId=Objects.toString(input.get("requestId"),"");if(requestId.isEmpty()||requestId.length()>160)throw new ApiException(400,"Неверный идентификатор операции");
  if(!(input.get("operation") instanceof Map<?,?>))throw new ApiException(400,"Неверная операция");
  @SuppressWarnings("unchecked") var op=(Map<String,Object>)input.get("operation");
  var prior=first("select revision from ss_mutations where document_id=? and user_id=? and request_id=?",id,user.get("id"),requestId);
  if(prior!=null){doc.put("role",role);return Map.of("ok",true,"revision",prior.get("revision"),"document",doc);}
  Map<String,Object> restore=null;
  if("restore".equals(op.get("type"))){Object revision=op.get("revision");if(!(revision instanceof Number n)||n.doubleValue()!=n.longValue()||n.longValue()<0)throw new ApiException(400,"Неверная версия");restore=rawVersion(id,n.longValue());restore.put("state",encode(restore.get("state")));}
  var result=engine.apply(doc,user,op,role,restore);long revision=((Number)result.get("revision")).longValue();
  String type=Objects.toString(op.get("type"),"");
  long structure=List.of("structure","sheet-delete","restore","merge","import-range").contains(type)?revision:((Number)doc.get("structureRevision")).longValue();
  db.update("update ss_documents set title=?,state=?::jsonb,revision=?,updated=?,structure_revision=?,change_type=? where id=?",result.get("title"),encode(result.get("state")),revision,result.get("updated"),structure,type,id);
  db.update("insert into ss_history(document_id,user_id,revision,changes,created) values(?,?,?,?::jsonb,?)",id,user.get("id"),revision,encode(op),result.get("updated"));
  db.update("insert into ss_versions values(?,?,?,?,?::jsonb,?)",id,revision,user.get("id"),result.get("title"),encode(result.get("state")),result.get("updated"));
  db.update("insert into ss_mutations values(?,?,?,?)",id,user.get("id"),requestId,revision);
  db.update("delete from ss_versions where document_id=? and revision<>0 and revision<?",id,Math.max(0,revision-99));
  // Return the stored representation, also used by polling. JSONB normalizes key order;
  // mixing it with the engine's order would reset client inputs keyed by JSON.stringify.
  var saved=rawDocument(id,false);saved.put("role",role);return Map.of("ok",true,"revision",revision,"document",saved);
 }
 public Object people(String token,String id){var user=requireUser(token);access(id,user);return rows("""
  select p.client_id as "socketId",u.id,u.name,p.color,p.cursor from ss_presence p join ss_users u on u.id=p.user_id
  join ss_sessions s on s.token=p.session_token join ss_documents d on d.id=p.document_id
  where p.document_id=? and p.last_seen>? and s.expires>? and (d.owner=u.id or exists(select 1 from ss_permissions a where a.document_id=d.id and a.email=u.email))
  order by p.client_id
  """,id,System.currentTimeMillis()-15000,System.currentTimeMillis());}
 @Transactional public void presence(String token,String id,Map<String,Object> input){
  var user=requireUser(token);access(id,user);String clientId=Objects.toString(input.get("clientId"),"");if(clientId.isEmpty()||clientId.length()>160)throw new ApiException(400,"Неверный клиент");
  Object cursor=input.get("cursor");
  if(cursor instanceof Map<?,?> c){if(!validIndex(c.get("row"),10000)||!validIndex(c.get("col"),200)||!(c.get("sheetId") instanceof String s)||s.length()>60)throw new ApiException(400,"Неверная позиция курсора");}
  else if(cursor!=null)throw new ApiException(400,"Неверная позиция курсора");
  String[] colors={"#1a73e8","#a142f4","#e8710a","#188038","#d93025"};String color=colors[Math.floorMod(clientId.hashCode(),colors.length)];
  db.update("insert into ss_presence values(?,?,?,?,?,?::jsonb,?) on conflict(document_id,session_token,client_id) do update set cursor=excluded.cursor,last_seen=excluded.last_seen",id,user.get("id"),token,clientId,color,cursor==null?null:encode(cursor),System.currentTimeMillis());
 }
 private boolean validIndex(Object value,int limit){return value instanceof Number n&&n.doubleValue()==n.intValue()&&n.intValue()>=0&&n.intValue()<limit;}
 @Transactional public void leave(String token,String id,Map<String,Object> input){requireUser(token);db.update("delete from ss_presence where document_id=? and session_token=? and client_id=?",id,token,Objects.toString(input.get("clientId"),""));}
 public Object poll(String token,String id,long revision){var doc=document(token,id);var result=new LinkedHashMap<String,Object>();result.put("role",doc.get("role"));result.put("people",people(token,id));result.put("document",((Number)doc.get("revision")).longValue()==revision?null:doc);return result;}
}
