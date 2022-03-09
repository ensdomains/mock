const mockENS = require('./preTest.js').mockENS
const dnssec = process.argv[2] === 'dnssec'
const exponential = process.argv[2] === 'dnssec'
mockENS({dnssec, exponential})
