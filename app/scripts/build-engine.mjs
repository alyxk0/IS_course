import {build} from 'esbuild';
await build({entryPoints:['scripts/engine-entry.js'],outfile:'backend/src/main/resources/sheet-engine.js',bundle:true,format:'iife',globalName:'SheetsEngine',platform:'browser',target:'es2022',minify:false,define:{'process.env.NODE_ENV':'"production"'}});
console.log('Spreadsheet operations bundled for Spring/GraalJS.');
