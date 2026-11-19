import { mkdir, copyFile, cp } from 'node:fs/promises';

const root=new URL('../',import.meta.url);
const from=path=>new URL('node_modules/'+path,root);
const to=path=>new URL('public/vendor/'+path,root);
await mkdir(to(''),{recursive:true});
const files={
 'pdf.mjs':'pdfjs-dist/build/pdf.min.mjs',
 'pdf.worker.mjs':'pdfjs-dist/build/pdf.worker.min.mjs',
 'jszip.js':'jszip/dist/jszip.min.js',
 'jszip-LICENSE':'jszip/LICENSE.markdown',
 'exceljs.js':'exceljs/dist/exceljs.min.js',
 'tesseract.js':'tesseract.js/dist/tesseract.esm.min.js',
 'ocr.worker.js':'tesseract.js/dist/worker.min.js',
 'tesseract-core-lstm.wasm.js':'tesseract.js-core/tesseract-core-lstm.wasm.js',
 'tesseract-core-lstm.wasm':'tesseract.js-core/tesseract-core-lstm.wasm',
 'eng.traineddata.gz':'@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz',
 'spa.traineddata.gz':'@tesseract.js-data/spa/4.0.0_best_int/spa.traineddata.gz',
 'pdfjs-LICENSE':'pdfjs-dist/LICENSE',
 'exceljs-LICENSE':'exceljs/LICENSE',
 'tesseract-LICENSE':'tesseract.js-core/LICENSE'
};
await Promise.all(Object.entries(files).map(([target,source])=>copyFile(from(source),to(target))));
await Promise.all(['cmaps','standard_fonts','wasm','iccs'].map(dir=>cp(from('pdfjs-dist/'+dir),to('pdf-'+dir),{recursive:true})));
