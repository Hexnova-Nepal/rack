// After signing, the installer's bytes change, so latest.yml (which the installed Rack checks
// before updating) must carry the signed file's size and hash. Usage: node scripts/refresh-latest-yml.js <dir>
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const dir = process.argv[2] || 'dist';
const yml = path.join(dir, 'latest.yml');
const src = fs.existsSync(yml) ? yml : path.join('dist', 'latest.yml');
let text = fs.readFileSync(src, 'utf8');
const setup = fs.readdirSync(dir).find((f) => /^Rack-Setup-.*\.exe$/.test(f));
if (!setup) throw new Error(`No installer in ${dir}`);
const buf = fs.readFileSync(path.join(dir, setup));
const sha512 = crypto.createHash('sha512').update(buf).digest('base64');
text = text.replace(/sha512: .+/g, `sha512: ${sha512}`).replace(/size: \d+/g, `size: ${buf.length}`);
fs.writeFileSync(path.join(dir, 'latest.yml'), text);
console.log(`latest.yml now matches ${setup} (${buf.length} bytes)`);
