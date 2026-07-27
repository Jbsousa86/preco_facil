const fs = require('fs');
let content = fs.readFileSync('dashboard.html', 'utf8');

let startIdx = content.indexOf('id="poster-container"');
let endIdx = content.indexOf('<!-- Bottom Contact Info -->');
endIdx = content.indexOf('</div>', endIdx + 200) + 150;

let posterBlock = content.substring(startIdx, endIdx);

let newBlock = posterBlock.replace(/([0-9.]+)rem/g, (match, p1) => {
    return Math.round(parseFloat(p1) * 16) + 'px';
});

content = content.substring(0, startIdx) + newBlock + content.substring(endIdx);
fs.writeFileSync('dashboard.html', content);
console.log('Done!');
