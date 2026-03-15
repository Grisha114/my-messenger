const fs = require('fs')

const svgIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="100" fill="#7c3aed"/>
  <text x="256" y="330" font-size="260" text-anchor="middle" fill="white">💬</text>
</svg>`

fs.writeFileSync('public/icon.svg', svgIcon)
console.log('Icons created')
