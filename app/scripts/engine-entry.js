import 'core-js/actual/url/index.js';
import {applyDocumentOperation} from '../server/documentOperations.js';
export function applyJson(input) {
 const {document,user,operation,role,restoreVersion}=JSON.parse(input);
 try{return JSON.stringify({document:applyDocumentOperation(document,user,operation,role,restoreVersion)});}
 catch(e){return JSON.stringify({error:e.message,status:e.status||400,code:e.code,protectionWarnings:e.protectionWarnings,revision:e.revision});}
}
