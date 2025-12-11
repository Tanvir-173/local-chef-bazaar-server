const fs = require('fs');
const key = fs.readFileSync('./local-chef-bazaar-9fed2-firebase-adminsdk-fbsvc-aa7e96a24c.json', 'utf8')
const base64 = Buffer.from(key).toString('base64')
console.log(base64)