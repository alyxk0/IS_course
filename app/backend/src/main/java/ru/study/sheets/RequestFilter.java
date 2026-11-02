package ru.study.sheets;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import jakarta.servlet.*;
import jakarta.servlet.http.*;
import java.io.IOException;
import java.net.URI;
@Component
public class RequestFilter extends OncePerRequestFilter {
 @Override protected void doFilterInternal(HttpServletRequest req,HttpServletResponse res,FilterChain chain)throws ServletException,IOException {
  res.setHeader("X-Content-Type-Options","nosniff");res.setHeader("Referrer-Policy","same-origin");
  if(req.getRequestURI().startsWith("/api/"))res.setHeader("Cache-Control","no-store");
  if(req.getContentLengthLong()>4_000_000){error(res,413,"Слишком большой запрос");return;}
  if(!req.getMethod().equals("GET")&&!req.getMethod().equals("HEAD")){
   String origin=req.getHeader("Origin");
   if(origin!=null){try{if(!URI.create(origin).getAuthority().equalsIgnoreCase(req.getHeader("Host"))){error(res,403,"Недопустимый источник запроса");return;}}catch(Exception e){error(res,403,"Недопустимый источник запроса");return;}}
  }
  chain.doFilter(req,res);
 }
 private void error(HttpServletResponse res,int status,String text)throws IOException{res.setStatus(status);res.setContentType("application/json;charset=UTF-8");res.getWriter().write("{\"error\":\""+text+"\"}");}
}
