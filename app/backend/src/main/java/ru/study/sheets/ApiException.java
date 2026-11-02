package ru.study.sheets;
import java.util.*;
public class ApiException extends RuntimeException {
 public final int status; public final Map<String,Object> details;
 public ApiException(int status,String message) {this(status,new LinkedHashMap<>(Map.of("error",message)));}
 public ApiException(int status,Map<String,Object> details) {super(String.valueOf(details.get("error")));this.status=status;this.details=details;}
}
