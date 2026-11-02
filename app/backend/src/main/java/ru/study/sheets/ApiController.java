package ru.study.sheets;
import org.springframework.web.bind.annotation.*;
import org.springframework.beans.factory.annotation.Value;
import jakarta.servlet.http.*;
import org.springframework.http.ResponseCookie;
import java.util.*;

@RestController @RequestMapping("/api")
public class ApiController {
 private final Store store;@Value("${app.cookie-secure:false}") private boolean secure;
 public ApiController(Store store){this.store=store;}
 private String token(HttpServletRequest request){if(request.getCookies()!=null)for(var cookie:request.getCookies())if(cookie.getName().equals("session"))return cookie.getValue();return null;}
 @GetMapping("/me") public Object me(HttpServletRequest req){var result=new HashMap<String,Object>();result.put("user",store.user(token(req)));return result;}
 @GetMapping("/runtime") public Object runtime(){return Map.of("transport","poll","intervalMs",250);}
 @PostMapping("/auth/{action}") public Object auth(@PathVariable String action,@RequestBody Map<String,Object> body,HttpServletRequest req,HttpServletResponse res){var login=store.login(action,body,req.getRemoteAddr());res.addHeader("Set-Cookie",ResponseCookie.from("session",login.token()).httpOnly(true).sameSite("Lax").secure(secure).path("/").maxAge(30L*86400).build().toString());return login.user();}
 @PostMapping("/logout") public Object logout(HttpServletRequest req,HttpServletResponse res){store.logout(token(req));res.addHeader("Set-Cookie",ResponseCookie.from("session","").path("/").maxAge(0).httpOnly(true).sameSite("Lax").secure(secure).build().toString());return Map.of("ok",true);}
 @GetMapping("/documents") public Object documents(HttpServletRequest r){return store.documents(token(r));}
 @PostMapping("/documents") public Object create(HttpServletRequest r){return store.create(token(r));}
 @GetMapping("/documents/{id}") public Object document(HttpServletRequest r,@PathVariable String id){return store.document(token(r),id);}
 @GetMapping("/documents/{id}/members") public Object members(HttpServletRequest r,@PathVariable String id){return store.members(token(r),id);}
 @PutMapping("/documents/{id}/members") public Object member(HttpServletRequest r,@PathVariable String id,@RequestBody Map<String,Object> body){store.member(token(r),id,body);return Map.of("ok",true);}
 @GetMapping("/documents/{id}/history") public Object history(HttpServletRequest r,@PathVariable String id){return store.history(token(r),id);}
 @GetMapping("/documents/{id}/versions/{revision}") public Object version(HttpServletRequest r,@PathVariable String id,@PathVariable long revision){return store.version(token(r),id,revision);}
 @PostMapping("/documents/{id}/operations") public Object operation(HttpServletRequest r,@PathVariable String id,@RequestBody Map<String,Object> body){return store.operation(token(r),id,body);}
 @PostMapping("/documents/{id}/join") public Object join(HttpServletRequest r,@PathVariable String id,@RequestBody Map<String,Object> body){store.presence(token(r),id,body);return Map.of("document",store.document(token(r),id),"people",store.people(token(r),id));}
 @PostMapping("/documents/{id}/presence") public Object presence(HttpServletRequest r,@PathVariable String id,@RequestBody Map<String,Object> body){store.presence(token(r),id,body);return Map.of("ok",true);}
 @PostMapping("/documents/{id}/leave") public Object leave(HttpServletRequest r,@PathVariable String id,@RequestBody Map<String,Object> body){store.leave(token(r),id,body);return Map.of("ok",true);}
 @GetMapping("/documents/{id}/poll") public Object poll(HttpServletRequest r,@PathVariable String id,@RequestParam(defaultValue="-1") long revision){return store.poll(token(r),id,revision);}
}
