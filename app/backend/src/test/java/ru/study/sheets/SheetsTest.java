package ru.study.sheets;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.testcontainers.junit.jupiter.*;
import org.testcontainers.containers.PostgreSQLContainer;
import java.util.*;
import java.util.concurrent.*;
import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest(properties="AUTH_LIMIT=10000") @Testcontainers
class SheetsTest {
 @Container static PostgreSQLContainer<?> pg=new PostgreSQLContainer<>("postgres:17-alpine");
 @DynamicPropertySource static void config(DynamicPropertyRegistry r){r.add("spring.datasource.url",pg::getJdbcUrl);r.add("spring.datasource.username",pg::getUsername);r.add("spring.datasource.password",pg::getPassword);}
 @Autowired Store store;@Autowired JdbcTemplate db;
 String owner,peer,id,sheet;
 @BeforeEach void setup(){
  db.execute("truncate ss_users,ss_sessions,ss_documents,ss_permissions,ss_history,ss_versions,ss_mutations,ss_presence restart identity cascade");
  owner=store.login("register",Map.of("email","owner@example.com","password","Testing12345","name","Owner"),"test").token();
  peer=store.login("register",Map.of("email","peer@example.com","password","Testing12345","name","Peer"),"test").token();
  var doc=store.create(owner);id=doc.get("id").toString();sheet=((Map<?,?>)((List<?>)((Map<?,?>)doc.get("state")).get("sheets")).getFirst()).get("id").toString();
 }
 Object op(String token,Map<String,Object> operation,String request){return store.operation(token,id,Map.of("operation",operation,"requestId",request));}
 @Test void registersAuthenticatesAndRejectsInvalidPassword(){assertNotNull(store.user(owner));assertNotNull(store.login("login",Map.of("email","OWNER@example.com","password","Testing12345"),"test").user());assertThrows(ApiException.class,()->store.login("login",Map.of("email","owner@example.com","password","Wrong123456"),"test"));}
 @Test void preservesUtf8BcryptCompatibility(){String pass="я".repeat(60);store.login("register",Map.of("email","unicode@example.com","name","Имя","password",pass),"test");assertNotNull(store.login("login",Map.of("email","unicode@example.com","password",pass),"test").user());}
 @Test void ownerCanEditAndViewerCannot(){op(owner,Map.of("type","cells","sheetId",sheet,"changes",List.of(Map.of("key","0,0","cell",Map.of("value","10")))),"one");store.member(owner,id,Map.of("email","peer@example.com","role","viewer"));assertThrows(ApiException.class,()->op(peer,Map.of("type","title","title","Denied"),"two"));assertEquals(1L,((Number)store.document(peer,id).get("revision")).longValue());}
 @Test void concurrentRequestsAreSerializedAndDeduplicated()throws Exception{
  store.member(owner,id,Map.of("email","peer@example.com","role","editor"));
  try(var pool=Executors.newFixedThreadPool(4)){
   List<Future<?>> result=new ArrayList<>();for(int i=0;i<4;i++){int n=i;result.add(pool.submit(()->op(n%2==0?owner:peer,Map.of("type","cells","sheetId",sheet,"changes",List.of(Map.of("key",n+",0","cell",Map.of("value","v"+n)))),"parallel-"+n)));}for(var future:result)future.get(30,TimeUnit.SECONDS);
   result.clear();for(int i=0;i<4;i++)result.add(pool.submit(()->op(owner,Map.of("type","sheet-add"),"same")));for(var future:result)future.get(30,TimeUnit.SECONDS);
  }assertEquals(5L,((Number)store.document(owner,id).get("revision")).longValue());assertEquals(5L,db.queryForObject("select count(*) from ss_history",Long.class));
 }
 @Test void formulasSurviveStructuralEditing(){
  op(owner,Map.of("type","cells","sheetId",sheet,"changes",List.of(Map.of("key","0,0","cell",Map.of("value","5")),Map.of("key","1,0","cell",Map.of("value","=A1*2")))),"cells");
  op(owner,Map.of("type","structure","sheetId",sheet,"axis","row","action","insert","index",0,"count",1),"insert");
  assertTrue(store.encode(store.document(owner,id)).contains("=A2*2"));
 }
 @Test void permissionsAndLogoutInvalidatePresence(){store.member(owner,id,Map.of("email","peer@example.com","role","editor"));store.presence(peer,id,Map.of("clientId","peer-client"));assertEquals(1,((List<?>)store.people(owner,id)).size());store.member(owner,id,Map.of("email","peer@example.com","role","remove"));assertEquals(0,((List<?>)store.people(owner,id)).size());assertThrows(ApiException.class,()->store.document(peer,id));store.logout(owner);assertNull(store.user(owner));}
 @Test void failedOperationDoesNotWriteVersion(){assertThrows(ApiException.class,()->op(owner,Map.of("type","nonsense"),"bad"));assertEquals(0L,db.queryForObject("select count(*) from ss_history",Long.class));assertEquals(1L,db.queryForObject("select count(*) from ss_versions",Long.class));}
 @Test void operationAndReloadReturnIdenticalJsonOrder(){
  @SuppressWarnings("unchecked") var result=(Map<String,Object>)op(owner,Map.of("type","named-range-set","namedRange",Map.of("name","Income","sheetId",sheet,"range",Map.of("r",0,"r2",0,"c",0,"c2",0))),"name");
  assertEquals(store.encode(store.document(owner,id)),store.encode(result.get("document")));
 }
 @Test void linksAndRestoreHaveSameBrowserSemantics(){
  op(owner,Map.of("type","cells","sheetId",sheet,"changes",List.of(Map.of("key","0,0","cell",Map.of("value","5","link","https://example.com/test?a=1&b=2")))),"link");
  assertTrue(store.encode(store.document(owner,id)).contains("https://example.com/test?a=1&b=2"));
  op(owner,Map.of("type","title","title","Changed"),"title");
  op(owner,Map.of("type","restore","revision",1,"expectedRevision",2),"restore");
  assertEquals("Новая таблица",store.document(owner,id).get("title"));
  assertTrue(store.encode(store.document(owner,id)).contains("https://example.com/test?a=1&b=2"));
 }
}
