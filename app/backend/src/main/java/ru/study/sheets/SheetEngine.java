package ru.study.sheets;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.graalvm.polyglot.*;
import org.graalvm.polyglot.proxy.ProxyExecutable;
import org.springframework.stereotype.Component;
import jakarta.annotation.PreDestroy;
import java.util.*;

@Component
public class SheetEngine {
 private final Context context;private final Value apply;private final ObjectMapper json;
 public SheetEngine(ObjectMapper json) throws Exception {
  this.json=json;
  context=Context.newBuilder("js").allowHostAccess(HostAccess.NONE).allowHostClassLookup(n->false).allowCreateThread(false)
   .option("engine.WarnInterpreterOnly","false").build();
  context.getBindings("js").putMember("javaUuid",(ProxyExecutable) args->UUID.randomUUID().toString());
  context.eval("js","globalThis.crypto={randomUUID:()=>javaUuid()};globalThis.structuredClone=x=>x===undefined?undefined:JSON.parse(JSON.stringify(x));globalThis.performance={now:()=>Date.now()};globalThis.console={log:()=>{},warn:()=>{},error:()=>{}};");
  try(var input=getClass().getResourceAsStream("/sheet-engine.js")) {
   if(input==null)throw new IllegalStateException("Run npm run build:engine before building the server");
   context.eval(Source.newBuilder("js",new String(input.readAllBytes(),java.nio.charset.StandardCharsets.UTF_8),"sheet-engine.js").build());
  }
  apply=context.getBindings("js").getMember("SheetsEngine").getMember("applyJson");
 }
 @SuppressWarnings("unchecked")
 public synchronized Map<String,Object> apply(Map<String,Object> doc,Map<String,Object> user,Map<String,Object> op,String role,Map<String,Object> restored) {
  try {
   var args=new LinkedHashMap<String,Object>();args.put("document",doc);args.put("user",user);args.put("operation",op);args.put("role",role);args.put("restoreVersion",restored);
   Map<String,Object> result=json.readValue(apply.execute(json.writeValueAsString(args)).asString(),Map.class);
   if(result.containsKey("error"))throw new ApiException(((Number)result.getOrDefault("status",400)).intValue(),result);
   return (Map<String,Object>)result.get("document");
  }catch(ApiException e){throw e;}catch(Exception e){throw new IllegalStateException("Spreadsheet operation failed",e);}
 }
 @PreDestroy public synchronized void close(){context.close();}
}
