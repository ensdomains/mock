import {
  loadContract, loadOldContract
} from './utils'
import packet from 'dns-packet';
const ROOT_NODE = '0x00000000000000000000000000000000'
async function deployDNSSEC(web3, accounts, ens, resolver) {
  const { sha3 } = web3.utils
  function deploy(contractJSON, ...args) {
    const contract = new web3.eth.Contract(contractJSON.abi)
    return contract
      .deploy({
        data: contractJSON.bytecode,
        arguments: args
      })
      .send({
        from: accounts[0],
        gas: 6700000
      })
  }

  function namehash(name) {
    let node =
      '0x0000000000000000000000000000000000000000000000000000000000000000'
    if (name !== '') {
      let labels = name.split('.')
      for (let i = labels.length - 1; i >= 0; i--) {
        node = sha3(node + sha3(labels[i]).slice(2), {
          encoding: 'hex'
        })
      }
    }
    return node.toString()
  }

  const RSASHA256Algorithm = loadContract('dnssec-oracle', 'algorithms/RSASHA256Algorithm')
  const RSASHA1Algorithm = loadContract('dnssec-oracle', 'algorithms/RSASHA1Algorithm')
  const SHA256Digest = loadContract('dnssec-oracle', 'digests/SHA256Digest')
  const SHA1Digest = loadContract('dnssec-oracle', 'digests/SHA1Digest')
  const SHA1NSEC3Digest = loadContract('dnssec-oracle', 'nsec3digests/SHA1NSEC3Digest')

  const dnsAnchors = require('@ensdomains/dnssec-oracle-anchors')
  const anchors = dnsAnchors.realEntries
  const DnsRegistrarOld = loadOldContract('dnsregistrar', 'DNSRegistrar')
  const DnsRegistrarNew = loadContract('dnsregistrar', 'DNSRegistrar')
  
  const SimplePublicSuffixList = loadContract('dnsregistrar', 'SimplePublicSuffixList')
  const DNSSECOLD = loadOldContract('dnssec-oracle', 'DNSSECImpl')
  const DNSSECNEW = loadContract('dnssec-oracle', 'DNSSECImpl')
  /* Deploy the main contracts  */
  const dnssecOld = await deploy(DNSSECOLD, dnsAnchors.encode(anchors))
  const dnssecNew = await deploy(DNSSECNEW, dnsAnchors.encode(anchors))
  const suffixes = await deploy(SimplePublicSuffixList)
  await suffixes.methods
    .addPublicSuffixes(['0x' + packet.name.encode('xyz').toString('hex')])
    .send({ from: accounts[0] });
  
  const registrarOld = await deploy(DnsRegistrarOld, dnssecOld._address, ens._address)
  const registrarNew = await deploy(DnsRegistrarNew, dnssecNew._address, suffixes._address, ens._address)
  console.log(1)
  const dnssecClaimOldId = '0x1aa2e641'
  const dnssecClaimNewId = '0x17d8f49b'
  const isOldRegistrar = await registrarOld.methods.supportsInterface(dnssecClaimOldId).call()
  const isNewRegistrar = await registrarNew.methods.supportsInterface(dnssecClaimNewId).call()
  console.log(2, {isOldRegistrar, isNewRegistrar})
  
  const rsasha256 = await deploy(RSASHA256Algorithm)
  const rsasha1 = await deploy(RSASHA1Algorithm)
  const sha256digest = await deploy(SHA256Digest)
  const sha1digest = await deploy(SHA1Digest)
  const sha1nsec3digest = await deploy(SHA1NSEC3Digest)

  async function setupDomain(dnssec, registrar, tld){
    await ens.methods.setSubnodeOwner(ROOT_NODE, sha3(tld), registrar._address).send({ from: accounts[0] })

    var owner = await ens.methods.owner(namehash(tld)).call()
    await dnssec.methods
      .setAlgorithm(5, rsasha1._address)
      .send({ from: accounts[0] })
    await dnssec.methods
      .setAlgorithm(7, rsasha1._address)
      .send({ from: accounts[0] })
    await dnssec.methods
      .setAlgorithm(8, rsasha256._address)
      .send({ from: accounts[0] })
    await dnssec.methods
      .setDigest(1, sha1digest._address)
      .send({ from: accounts[0] })
    await dnssec.methods
      .setDigest(2, sha256digest._address)
      .send({ from: accounts[0] })
    await dnssec.methods
      .setNSEC3Digest(1, sha1nsec3digest._address)
      .send({ from: accounts[0] })
  
    console.log(`${tld} DNSSSC ORACLE contract is deployed at `, dnssec._address)
    console.log(`${tld} DNSregistrar contract is deployed at `, registrar._address)
    console.log(`The owner of ${tld} doamin is `, owner)
  }
  await setupDomain(dnssecOld,registrarOld, 'art')
  await setupDomain(dnssecNew,registrarNew, 'xyz')

  return { dnssecOld, dnssecNew }
}
export default deployDNSSEC

