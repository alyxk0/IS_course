package ru.study.sheets;
import org.springframework.web.bind.annotation.*;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import java.util.Map;
@RestControllerAdvice
public class Errors {
 @ExceptionHandler(ApiException.class) public ResponseEntity<?> api(ApiException e){return ResponseEntity.status(e.status).body(e.details);}
 @ExceptionHandler(DuplicateKeyException.class) public ResponseEntity<?> duplicate(Exception e){return ResponseEntity.status(409).body(Map.of("error","Такая запись уже существует"));}
 @ExceptionHandler({HttpMessageNotReadableException.class,IllegalArgumentException.class}) public ResponseEntity<?> bad(Exception e){return ResponseEntity.badRequest().body(Map.of("error","Некорректный запрос"));}
}
