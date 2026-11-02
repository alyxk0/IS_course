import Database from 'better-sqlite3';
import {writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const [source,target]=process.argv.slice(2);
if(!source||!target||resolve(source)===resolve(target))throw Error('Usage: node scripts/export-sqlite.mjs source.db target.json');
const db=new Database(source,{readonly:true,fileMustExist:true});
try{
 const snapshot=db.transaction(()=>Object.fromEntries(['users','sessions','documents','permissions','history','versions'].map(table=>[table,db.prepare(`SELECT * FROM ${table}`).all()])) )();
 await writeFile(target,JSON.stringify(snapshot),{flag:'wx'});
 console.log('Exported:',snapshot.users.length,'users,',snapshot.documents.length,'documents.');
}finally{db.close();}
