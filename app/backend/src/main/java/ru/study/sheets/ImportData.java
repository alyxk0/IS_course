package ru.study.sheets;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.ApplicationArguments;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.file.Path;
import java.util.*;

@Component
public class ImportData implements ApplicationRunner {
 @Value("${app.import-file:}") private String file;
 private final JdbcTemplate db;private final ObjectMapper json;private final TransactionTemplate tx;
 public ImportData(JdbcTemplate db,ObjectMapper json,PlatformTransactionManager tm){this.db=db;this.json=json;this.tx=new TransactionTemplate(tm);}
 @SuppressWarnings("unchecked") public void run(ApplicationArguments args)throws Exception{
  if(file.isBlank())return;
  Map<String,List<Map<String,Object>>> data=json.readValue(Path.of(file).toFile(),Map.class);
  tx.executeWithoutResult(status->{
   if(db.queryForObject("select count(*) from ss_users",Long.class)!=0||db.queryForObject("select count(*) from ss_documents",Long.class)!=0)throw new IllegalStateException("Import requires an empty target database");
   for(var r:data.get("users"))db.update("insert into ss_users values(?,?,?,?)",r.get("id"),r.get("email"),r.get("name"),r.get("password"));
   for(var r:data.get("sessions"))db.update("insert into ss_sessions values(?,?,?)",r.get("token"),r.get("user_id"),r.get("expires"));
   for(var r:data.get("documents"))db.update("insert into ss_documents(id,owner,title,state,revision,updated) values(?,?,?,?::jsonb,?,?)",r.get("id"),r.get("owner"),r.get("title"),r.get("state"),r.get("revision"),r.get("updated"));
   for(var r:data.get("permissions"))db.update("insert into ss_permissions values(?,?,?)",r.get("document_id"),r.get("email"),r.get("role"));
   for(var r:data.get("history"))db.update("insert into ss_history(document_id,user_id,revision,changes,created) values(?,?,?,?::jsonb,?)",r.get("document_id"),r.get("user_id"),r.get("revision"),r.get("changes"),r.get("created"));
   for(var r:data.get("versions"))db.update("insert into ss_versions values(?,?,?,?,?::jsonb,?)",r.get("document_id"),r.get("revision"),r.get("user_id"),r.get("title"),r.get("state"),r.get("created"));
  });
  System.out.println("Imported "+data.get("users").size()+" users and "+data.get("documents").size()+" documents; source database unchanged.");
 }
}
