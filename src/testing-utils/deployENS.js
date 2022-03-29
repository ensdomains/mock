import deployDNSSEC from './deployDNSSEC'

import {
  DAYS,
  advanceTime,
  mine,
  registerName,
  auctionLegacyName,
  loadContract,
  deploy,
} from './utils'
import { table } from 'table'
import { NameLogger } from './namelogger'
import { interfaces } from '../constants/interfaces'
const ROOT_NODE = '0x00000000000000000000000000000000'
// ipfs://QmTeW79w7QQ6Npa3b1d5tANreCDxF2iDaAPsDvW6KtLmfB
const contenthash =
  '0xe301017012204edd2984eeaf3ddf50bac238ec95c5713fb40b5e428b508fdbe55d3b9f155ffe'
const content =
  '0x736f6d65436f6e74656e74000000000000000000000000000000000000000000'
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

// dnslink based ipns'app.uniswap.org'
const deprecated_contenthash = '0xe5010170000f6170702e756e69737761702e6f7267'

const toBN = require('web3-utils').toBN
const {
  legacyRegistrar: legacyRegistrarInterfaceId,
  permanentRegistrar: permanentRegistrarInterfaceId,
  permanentRegistrarWithConfig: permanentRegistrarWithConfigInterfaceId,
  bulkRenewal: bulkRenewalInterfaceId,
  linearPremiumPriceOracle: linearPremiumPriceOracleInterfaceId
} = interfaces

async function deployENS({ web3, accounts, dnssec = false, exponential = false }) {
  const { sha3 } = web3.utils
  console.log({dnssec, exponential})
  function namehash(name) {
    let node =
      '0x0000000000000000000000000000000000000000000000000000000000000000'
    if (name !== '') {
      let labels = name.split('.')
      for (let i = labels.length - 1; i >= 0; i--) {
        node = sha3(node + sha3(labels[i]).slice(2), {
          encoding: 'hex',
        })
      }
    }
    return node.toString()
  }
  const nameLogger = new NameLogger({ sha3, namehash })
  const registryJSON = loadContract('registry', 'ENSRegistry')
  const resolverJSON = loadContract('resolvers', 'PublicResolver')
  const oldResolverJSON = loadContract('ens-022', 'PublicResolver')
  const reverseRegistrarJSON = loadContract('registry', 'ReverseRegistrar')
  const priceOracleJSON = loadContract('ethregistrar-202', 'SimplePriceOracle')
  const linearPremiumPriceOracleJSON = loadContract(
    'ethregistrar',
    'LinearPremiumPriceOracle'
  )
  const exponentialPremiumPriceOracleJSON = loadContract(
    'ethregistrar',
    'ExponentialPremiumPriceOracle'
  )
  const dummyOracleJSON = loadContract('ethregistrar', 'DummyOracle')
  const controllerJSON = loadContract('ethregistrar', 'ETHRegistrarController')
  const bulkRenewalJSON = loadContract('ethregistrar', 'BulkRenewal')
  const testRegistrarJSON = loadContract('registry', 'TestRegistrar')
  const legacyAuctionRegistrarSimplifiedJSON = loadContract(
    'ens-022',
    'HashRegistrar'
  )
  const ENSWithFallbackJSON = loadContract(
    'registry',
    'ENSRegistryWithFallback'
  )
  const oldBaseRegistrarJSON = loadContract(
    'ethregistrar-202',
    'OldBaseRegistrarImplementation'
  )
  const newBaseRegistrarJSON = loadContract(
    'ethregistrar',
    'BaseRegistrarImplementation'
  )
  const registrarMigrationJSON = loadContract(
    'ethregistrar-202',
    'RegistrarMigration'
  )
  const EthRegistrarSubdomainRegistrarJSON = loadContract(
    'subdomain-registrar',
    'EthRegistrarSubdomainRegistrar'
  )
  const ENSMigrationSubdomainRegistrarJSON = loadContract(
    'subdomain-registrar',
    'ENSMigrationSubdomainRegistrar'
  )

  const nameWrapperJSON = loadContract('wrapper', 'NameWrapper')
  const staticMetadataServiceJSON = loadContract('wrapper', 'StaticMetadataService')

  console.log('Deploying from account ', accounts[0])
  /* Deploy the main contracts  */
  try {
    var ens = await deploy(web3, accounts[0], registryJSON)
    var resolver = await deploy(web3, accounts[0], resolverJSON, ens._address, ZERO_ADDRESS)
    var oldResolver = await deploy(
      web3,
      accounts[0],
      oldResolverJSON,
      ens._address
    )
    var oldReverseRegistrar = await deploy(
      web3,
      accounts[0],
      reverseRegistrarJSON,
      ens._address,
      resolver._address
    )
    var testRegistrar = await deploy(
      web3,
      accounts[0],
      testRegistrarJSON,
      ens._address,
      namehash('test')
    )
    const eightweeks = (60 * 60 * 24 * 7 * 8)
    const startTime = (await web3.eth.getBlock('latest')).timestamp - eightweeks
    var legacyAuctionRegistrar = await deploy(
      web3,
      accounts[0],
      legacyAuctionRegistrarSimplifiedJSON,
      ens._address,
      namehash('eth'),
      startTime
    )


  } catch (e) {
    console.log('deployment failed', e)
  }

  const ensContract = ens.methods
  const resolverContract = resolver.methods
  const oldResolverContract = oldResolver.methods
  const oldReverseRegistrarContract = oldReverseRegistrar.methods
  const testRegistrarContract = testRegistrar.methods
  const legacyAuctionRegistrarContract = legacyAuctionRegistrar.methods

  const tld = 'eth'
  const tldHash = sha3(tld)

  /* Setup the root TLD */
  await ensContract
    .setSubnodeOwner(ROOT_NODE, tldHash, accounts[0])
    .send({ from: accounts[0] })
  await ensContract
    .setSubnodeOwner(ROOT_NODE, sha3('test'), accounts[0])
    .send({ from: accounts[0] })
  await ensContract
    .setResolver(namehash(''), resolver._address)
    .send({ from: accounts[0] })
  await ensContract
    .setResolver(namehash('eth'), resolver._address)
    .send({ from: accounts[0] })
  await ensContract
    .setResolver(namehash('test'), resolver._address)
    .send({ from: accounts[0] })
  await ensContract
    .setSubnodeOwner(ROOT_NODE, sha3('test'), testRegistrar._address)
    .send({ from: accounts[0] })
  await ensContract
    .setSubnodeOwner(ROOT_NODE, sha3('eth'), legacyAuctionRegistrar._address)
    .send({ from: accounts[0] })

  const legacynames = ['auctioned2', 'auctioned3']

  if (dnssec) {
    console.log('*** Skipping auction to make DNSSEC work')
  } else {
    // Can migrate now
    try {
      for (var i = 0; i < legacynames.length; i++) {
        await auctionLegacyName(
          web3,
          accounts[0],
          legacyAuctionRegistrarContract,
          legacynames[i]
        )
      }
    } catch (e) {
      console.log('auctioning Legacy name failed', { name:legacynames[i], e})
    }
    const lockoutlength = 60 * 60 * 24 * 190
    await advanceTime(web3, lockoutlength)
    await mine(web3)
    // Need to wait for the lock period to end
  }

  /* Setup the root reverse node */
  await ensContract
    .setSubnodeOwner(ROOT_NODE, sha3('reverse'), accounts[0])
    .send({ from: accounts[0] })
  nameLogger.record('reverse', { label: 'reverse' })

  await ensContract
    .setSubnodeOwner(namehash('reverse'), sha3('addr'), accounts[0])
    .send({ from: accounts[0] })
  console.log('setup root reverse with addr label')
  nameLogger.record('addr.reverse', { label: 'addr' })
  await ensContract
    .setResolver(namehash('addr.reverse'), resolver._address)
    .send({ from: accounts[0] })
  console.log('setup root reverse with public resolver')
  /* Setup the reverse subdomain: addr.reverse */
  await ensContract
    .setSubnodeOwner(
      namehash('reverse'),
      sha3('addr'),
      oldReverseRegistrar._address
    )
    .send({ from: accounts[0] })
  console.log('setup root reverse with the reverse registrar')
  /* Set the old hash registrar contract as the owner of .eth */
  await ensContract
    .setSubnodeOwner(ROOT_NODE, tldHash, legacyAuctionRegistrar._address)
    .send({ from: accounts[0] })
  nameLogger.record('eth', { label: 'eth' })

  console.log('Successfully setup old hash registrar')

  const now = (await web3.eth.getBlock('latest')).timestamp
  const priceOracle = await deploy(web3, accounts[0], priceOracleJSON, 1)
  const oldBaseRegistrar = await deploy(
    web3,
    accounts[0],
    oldBaseRegistrarJSON,
    ens._address,
    legacyAuctionRegistrar._address,
    namehash('eth'),
    now + 365 * DAYS
  )
  console.log('Successfully setup base registrar')
  const controller = await deploy(
    web3,
    accounts[0],
    controllerJSON,
    oldBaseRegistrar._address,
    priceOracle._address,
    2, // 10 mins in seconds
    86400 // 24 hours in seconds
  )

  console.log('Successfully setup permanent registrar controller')
  const oldBaseRegistrarContract = oldBaseRegistrar.methods
  const controllerContract = controller.methods

  console.log('Price oracle deployed at: ', priceOracle._address)
  console.log('Base registrar deployed at: ', oldBaseRegistrar._address)
  console.log('Controller deployed at: ', controller._address)

  await ensContract
    .setSubnodeOwner(ROOT_NODE, tldHash, accounts[0])
    .send({ from: accounts[0] })
  // await resolverContract
  //   .setApprovalForAll(accounts[0], true)
  //   .send({ from: accounts[0] })

  try {
    await resolverContract
      .setInterface(
        namehash('eth'),
        legacyRegistrarInterfaceId,
        legacyAuctionRegistrar._address
      )
      .send({
        from: accounts[0],
      })
  } catch (e) {
    console.log(e)
  }

  console.log(
    `Set .eth legacy registrar interface Id to ${legacyAuctionRegistrar._address}`
  )

  await resolverContract
    .setInterface(
      namehash('eth'),
      permanentRegistrarInterfaceId,
      controller._address
    )
    .send({ from: accounts[0] })

  console.log(
    `Set .eth permanent registrar interface Id to ${controller._address}`
  )

  /* Set the permanent registrar contract as the owner of .eth */
  await ensContract
    .setSubnodeOwner(ROOT_NODE, tldHash, oldBaseRegistrar._address)
    .send({ from: accounts[0] })

  console.log('Add controller to base registrar')
  await oldBaseRegistrarContract
    .addController(controller._address)
    .send({ from: accounts[0] })

  const newnames = [
    'testing',
    'newname',
    'resolver',
    'oldresolver',
    'awesome',
    'superawesome',
    'notsoawesome',
    'abittooawesome',
    'abittooawesome2',
    'abittooawesome3',
    'subdomaindummy',
    'contractdomain',
    'data',
    'ens',
  ]




  console.log('Register name')
  try {
    for (var i = 0; i < newnames.length; i++) {
      await registerName(web3, accounts[0], controllerContract, newnames[i])
      nameLogger.record(`${newnames[i]}.eth`, { label: newnames[i] })
    }
  } catch (e) {
    console.log('Failed to register a name', e)
  }

  await registerName(web3, accounts[1], controllerContract, 'otherowner')
  nameLogger.record(`otherowner.eth`, { label: 'otherowner' })
  newnames.push('otherowner')
  /* Setup domain with a resolver and addr/content */
  const aBitTooAwesome = 'abittooawesome.eth'
  const aBitTooAwesome2 = 'abittooawesome2.eth'
  const aBitTooAwesome3 = 'abittooawesome3.eth'
  const otherOwner = 'otherowner.eth'

  async function addResolverAndRecords(name, resolverAddress, account = accounts[0]) {
    console.log('Setting up ', name, 'with old resolver and records')
    const hash = namehash(name)
    await ensContract
      .setResolver(hash, resolverAddress)
      .send({ from: account })
    await resolverContract
      .setAddr(hash, resolverAddress)
      .send({ from: account })

    await resolverContract
      .setContenthash(hash, contenthash)
      .send({ gas: 5000000, from: account })
    console.log('finished setting up old resolver and records', name)
  }

  addResolverAndRecords(aBitTooAwesome2, resolver._address)
  addResolverAndRecords(aBitTooAwesome3, resolver._address)
  addResolverAndRecords(otherOwner, resolver._address, accounts[1])

  const contractdomain = namehash('contractdomain.eth')

  await ensContract
    .setResolver(contractdomain, resolver._address)
    .send({ from: accounts[0] })
  await resolverContract
    .setAddr(contractdomain, accounts[0])
    .send({ from: accounts[0] })
  await ensContract
    .setOwner(contractdomain, testRegistrar._address)
    .send({ from: accounts[0] })
  await oldReverseRegistrarContract
    .setName('abittooawesome.eth')
    .send({ from: accounts[0], gas: 1000000 })

  /* Point the resolver.eth's resolver to the public resolver */
  console.log('Setting up resolvers')
  await ensContract
    .setResolver(namehash('resolver.eth'), resolver._address)
    .send({
      from: accounts[0],
    })
  await ensContract
    .setResolver(namehash('oldresolver.eth'), oldResolver._address)
    .send({ from: accounts[0] })
  /* Resolve the resolver.eth address to the address of the public resolver */
  await resolverContract
    .setAddr(namehash('resolver.eth'), resolver._address)
    .send({ from: accounts[0] })
  /* Resolve the oldresolver.eth address to the address of the public resolver */

  await resolverContract
    .setAddr(namehash('oldresolver.eth'), oldResolver._address)
    .send({
      from: accounts[0],
    })

  /* Resolve the resolver.eth content to a 32 byte content hash */
  console.log('Setting up contenthash')

  await resolverContract
    .setContenthash(namehash('resolver.eth'), contenthash)
    .send({ from: accounts[0], gas: 5000000 })
  await oldResolverContract
    .setContent(namehash('oldresolver.eth'), content)
    .send({ from: accounts[0] })

  /* Setup a reverse for account[0] to eth tld  */

  await oldReverseRegistrarContract
    .setName('eth')
    .send({ from: accounts[2], gas: 1000000 })

  await mine(web3)
  let current = await web3.eth.getBlock('latest')
  console.log(`The current time is ${new Date(current.timestamp * 1000)}`)
  const oldEns = ens
  let label = 'notmigrated'

  await registerName(web3, accounts[0], controllerContract, label)
  nameLogger.record(`${label}.eth`, { label: label })

  await ensContract
    .setSubnodeOwner(namehash('testing.eth'), sha3('sub1'), accounts[0])
    .send({
      from: accounts[0],
    })

  nameLogger.record(`sub1.testing.eth`, { label: 'sub1' })
  await ensContract
    .setSubnodeOwner(namehash('testing.eth'), sha3('sub2'), accounts[0])
    .send({
      from: accounts[0],
    })
  await ensContract
    .setResolver(namehash('sub1.testing.eth'), resolver._address)
    .send({ from: accounts[0] })
  await ensContract
    .setResolver(namehash('sub2.testing.eth'), resolver._address)
    .send({ from: accounts[0] })
  await resolverContract
    .setAddr(namehash('sub2.testing.eth'), accounts[0])
    .send({ from: accounts[0] })

  await resolverContract['setAddr(bytes32,uint256,bytes)'](
    namehash('sub2.testing.eth'),
    0, //BTC
    '0x76a91462e907b15cbf27d5425399ebf6f0fb50ebb88f1888ac' //1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa
  ).send({ from: accounts[0] })

  await resolverContract
    .setContenthash(namehash('sub2.testing.eth'), contenthash)
    .send({ gas: 5000000, from: accounts[0] })

  nameLogger.record(`sub2.testing.eth`, { label: 'sub2' })
  await ensContract
    .setSubnodeOwner(namehash('sub2.testing.eth'), sha3('a1'), accounts[0])
    .send({
      from: accounts[0],
    })
  await ensContract
    .setResolver(namehash('a1.sub2.testing.eth'), resolver._address)
    .send({ from: accounts[0] })
  await resolverContract
    .setAddr(namehash('a1.sub2.testing.eth'), accounts[0])
    .send({ from: accounts[0] })
  nameLogger.record(`a1.sub2.testing.eth`, { label: 'a1' })

  await ensContract
    .setSubnodeOwner(namehash('otherowner.eth'), sha3('sub1'), accounts[0])
    .send({ from: accounts[1] })
  await ensContract
    .setResolver(namehash('sub1.otherowner.eth'), resolver._address)
    .send({ from: accounts[0] })
  await resolverContract
    .setAddr(namehash('sub1.otherowner.eth'), accounts[0])
    .send({ from: accounts[0] })
  nameLogger.record(`sub1.otherowner.eth`, { label: 'sub1' })

  await ensContract
    .setSubnodeOwner(namehash('otherowner.eth'), sha3('sub2'), accounts[1])
    .send({ from: accounts[1] })
  await ensContract
    .setResolver(namehash('sub2.otherowner.eth'), resolver._address)
    .send({ from: accounts[1] })
  await resolverContract
    .setAddr(namehash('sub2.otherowner.eth'), accounts[1])
    .send({ from: accounts[1] })
  nameLogger.record(`sub2.otherowner.eth`, { label: 'sub2' })

  await ensContract
    .setSubnodeOwner(namehash('testing.eth'), sha3('sub4'), accounts[1])
    .send({ from: accounts[0] })
  await ensContract
    .setResolver(namehash('sub4.testing.eth'), resolver._address)
    .send({ from: accounts[1] })
  await resolverContract
    .setAddr(namehash('sub4.testing.eth'), accounts[0])
    .send({ from: accounts[1] })
  await resolverContract['setAddr(bytes32,uint256,bytes)'](
    namehash('sub4.testing.eth'),
    0, //BTC
    '0x76a91462e907b15cbf27d5425399ebf6f0fb50ebb88f1888ac' //1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa
  ).send({ from: accounts[1] })
  nameLogger.record(`sub4.testing.eth`, { label: 'sub4' })

  const oldSubdomainRegistrar = await deploy(
    web3,
    accounts[0],
    EthRegistrarSubdomainRegistrarJSON,
    ens._address
  )
  const oldSubdomainRegistrarContract = oldSubdomainRegistrar.methods
  // Create the new subdomain registrar

  const subdomainRegistrar = await deploy(
    web3,
    accounts[0],
    ENSMigrationSubdomainRegistrarJSON,
    ens._address
  )
  // This keeps failing hence commenteed out
  // await oldBaseRegistrarContract.approve(oldSubdomainRegistrar._address, sha3('ismoney')).send({from: accounts[0]})
  // let ethOwner = await ensContract.owner(namehash('eth')).call()
  // if(ethOwner !== oldBaseRegistrar._address) throw('base registrar is not the owner of eth')
  // console.log('*** before the call')
  // await oldSubdomainRegistrarContract.configureDomain('ismoney' , 0, 0).send({from: accounts[0]})
  // console.log('*** after the call')

  // // // Register a subdomain on the old subdomain registrar
  // await oldSubdomainRegistrarContract.register(sha3('ismoney'), 'jeff', accounts[0], ZERO_ADDRESS, newResolver._address).send({from: accounts[0]})

  // Create the new ENS registry and registrar
  const newEns = await deploy(
    web3,
    accounts[0],
    ENSWithFallbackJSON,
    oldEns._address
  )
  const newEnsContract = newEns.methods
  const newBaseRegistrar = await deploy(
    web3,
    accounts[0],
    newBaseRegistrarJSON,
    newEns._address,
    namehash('eth')
  )
  const newBaseRegistrarContract = newBaseRegistrar.methods
  await newBaseRegistrarContract
    .addController(accounts[0])
    .send({ from: accounts[0] })
  // Create the new controller

  console.log('Going to set dummy oracle')
  // Dummy oracle with 1 ETH == 3000 USD
  const dummyOracleRate = toBN(300000000 * 1000)
  const dummyOracle = await deploy(
    web3,
    accounts[0],
    dummyOracleJSON,
    dummyOracleRate
  )
  const dummyOracleContract = dummyOracle.methods
  const latestAnswer = await dummyOracleContract.latestAnswer().call()
  console.log('Dummy USD Rate', { latestAnswer })
  
  const premium = toBN('100000000000000000000000') // 100000 * 1e18
  const decreaseDuration = toBN(28 * DAYS)
  const decreaseRate = premium.div(decreaseDuration)
  const linearPremiumPriceOracle = await deploy(
    web3,
    accounts[0],
    linearPremiumPriceOracleJSON,
    dummyOracle._address,
    // Oracle prices from https://etherscan.io/address/0xb9d374d0fe3d8341155663fae31b7beae0ae233a#events
    // 0,0, 127, 32, 1
    [0, 0, toBN(20294266869609), toBN(5073566717402), toBN(158548959919)],
    premium,
    decreaseRate
  )

  const exponentialPremiumPriceOracle = await deploy(
    web3,
    accounts[0],
    exponentialPremiumPriceOracleJSON,
    dummyOracle._address,
    // Oracle prices from https://etherscan.io/address/0xb9d374d0fe3d8341155663fae31b7beae0ae233a#events
    // 0,0, 127, 32, 1
    // [0, 0, toBN(20294266869609), toBN(5073566717402), toBN(158548959919)],
    [0, 0, toBN(20294266869609), toBN(5073566717402), toBN(158548959919)],
    21
  )
  const linearPremiumPriceOracleContract = linearPremiumPriceOracle.methods
  const exponentialPremiumPriceOracleContract = exponentialPremiumPriceOracle.methods

  const newController = await deploy(
    web3,
    accounts[0],
    controllerJSON,
    newBaseRegistrar._address,
    exponential ? exponentialPremiumPriceOracle._address : linearPremiumPriceOracle._address,
    2, // 10 mins in seconds
    86400 // 24 hours in seconds
  )
  const newControllerContract = newController.methods

  // Create the new resolver
  const newResolver = await deploy(
    web3,
    accounts[0],
    resolverJSON,
    newEns._address,
    ZERO_ADDRESS
  )
  const newResolverContract = newResolver.methods
  // Set resolver to the new ENS
  async function addNewResolverAndRecords(name) {
    console.log('setting up ', name)
    const hash = namehash(name)
    console.log('resolver')
    await newEnsContract.setResolver(hash, newResolver._address).send({
      from: accounts[0],
    })
    console.log('addr')
    await newResolverContract.setAddr(hash, newResolver._address).send({
      from: accounts[0],
    })
    // ipfs://QmTeW79w7QQ6Npa3b1d5tANreCDxF2iDaAPsDvW6KtLmfB
    console.log('contenthash')
    await newResolverContract
      .setContenthash(hash, contenthash)
      .send({ gas: 5000000, from: accounts[0] })

    console.log('finished setting up', name)
  }
  const bulkRenewal = await deploy(
    web3,
    accounts[0],
    bulkRenewalJSON,
    newEns._address
  )
  let newTestRegistrar,
    newReverseRegistrar,
    registrarMigration,
    registrarMigrationContract

  if (dnssec) {
    // Redeploy under new registry
    await deployDNSSEC(web3, accounts, newEns, newResolver)
  }
  await newEnsContract
    .setSubnodeOwner(ROOT_NODE, sha3('eth'), accounts[0])
    .send({ from: accounts[0] })
  await newEnsContract
    .setResolver(namehash('eth'), newResolver._address)
    .send({ from: accounts[0], gas: 6000000 })
  await newResolverContract
    .setApprovalForAll(newController._address, true)
    .send({ from: accounts[0] })

  await newResolverContract
    .setInterface(
      namehash('eth'),
      permanentRegistrarInterfaceId,
      newController._address
    )
    .send({ from: accounts[0] })
  await newResolverContract
    .setInterface(
      namehash('eth'),
      permanentRegistrarWithConfigInterfaceId,
      newController._address
    )
    .send({ from: accounts[0] })

  // We still need to know what legacyAuctionRegistrar is to check who can release deed.
  if(!dnssec){
    await newResolverContract
    .setInterface(
      namehash('eth'),
      legacyRegistrarInterfaceId,
      legacyAuctionRegistrar._address
    )
    .send({ from: accounts[0] })
  }

  await newResolverContract
    .setInterface(
      namehash('eth'),
      bulkRenewalInterfaceId,
      bulkRenewal._address
    )
    .send({ from: accounts[0] })

  await newResolverContract
    .setInterface(
      namehash('eth'),
      linearPremiumPriceOracleInterfaceId,
      exponential? exponentialPremiumPriceOracle._address : linearPremiumPriceOracle._address
    )
    .send({ from: accounts[0] })

  //set notsoawesome to new resolver
  await newEnsContract
    .setSubnodeOwner(ROOT_NODE, sha3('eth'), newBaseRegistrar._address)
    .send({ from: accounts[0] })
  nameLogger.record('eth', { label: 'eth', migrated: true })
  newTestRegistrar = await deploy(
    web3,
    accounts[0],
    testRegistrarJSON,
    newEns._address,
    namehash('test')
  )
  const newTestRegistrarContract = newTestRegistrar.methods
  await newEnsContract
    .setSubnodeOwner(ROOT_NODE, sha3('test'), newTestRegistrar._address)
    .send({ from: accounts[0] })
  nameLogger.record('test', { label: 'test', migrated: true })
  newReverseRegistrar = await deploy(
    web3,
    accounts[0],
    reverseRegistrarJSON,
    newEns._address,
    newResolver._address
  )

  // Create the migration contract. Make it the owner of 'eth' on the old
  registrarMigration = await deploy(
    web3,
    accounts[0],
    registrarMigrationJSON,
    oldBaseRegistrar._address,
    newBaseRegistrar._address,
    oldSubdomainRegistrar._address,
    subdomainRegistrar._address
  )
  registrarMigrationContract = registrarMigration.methods
  await newBaseRegistrarContract
    .addController(registrarMigration._address)
    .send({ from: accounts[0] })
  await ensContract
    .setSubnodeOwner(ROOT_NODE, sha3('eth'), registrarMigration._address)
    .send({ from: accounts[0] })

  console.log('Migrating permanent registrar names')
  try {
    for (var i = 0; i < newnames.length; i++) {
      let name = newnames[i]
      let domain = `${name}.eth`
      let labelhash = sha3(name)
      nameLogger.record(domain, { label: name, migrated: true })
      let owner = await ensContract.owner(namehash(domain))
      if (owner === accounts[0]) {
        await ensContract
          .setTTL(namehash(domain), 123)
          .send({ from: accounts[0] })

        await ensContract
          .setResolver(namehash(domain), newResolver._address)
          .send({ from: accounts[0] })
      } else {
        console.log(
          `${domain} is not owned by ${accounts[0]} hence not setting ttl nor resolver`
        )
      }

      let tx = await registrarMigrationContract
        .migrate(labelhash)
        .send({ from: accounts[0], gas: 6000000 })
    }
  } catch (e) {
    console.log('Failed to migrate a name', e)
  }

  if(!dnssec){
    console.log('Migrate legacy names')
    try {
      async function migrate(label) {
        let name = label
        let domain = `${name}.eth`
        let labelhash = sha3(name)
        console.log(`Migrate legacy ${domain}`)
        await ensContract
          .setResolver(namehash(domain), resolver._address)
          .send({ from: accounts[0] })
        await ensContract
          .setTTL(namehash(domain), 123)
          .send({ from: accounts[0] })
        let tx = await registrarMigrationContract
          .migrateLegacy(labelhash)
          .send({ from: accounts[0], gas: 6000000 })
      }
      for (var i = 0; i < legacynames.length; i++) {
        await migrate(legacynames[i])
        nameLogger.record(`${legacynames[i]}.eth`, {
          label: legacynames[i],
          migrated: true,
        })
      }
    } catch (e) {
      console.log('Failed to migrate a name', e)
    }
    console.log(`Releasing the deed of auctioned2`)
    await legacyAuctionRegistrarContract
      .releaseDeed(sha3('auctioned2'))
      .send({ from: accounts[0] })
  }
  await newEnsContract
    .setResolver(namehash('resolver.eth'), newResolver._address)
    .send({ from: accounts[0] }) 

  console.log(
    'Set resolver.eth address to new resovler address',
    newResolver._address
  )
  await newResolverContract
    .setAddr(namehash('resolver.eth'), newResolver._address)
    .send({ from: accounts[0] })

  await newEnsContract
    .setSubnodeOwner(namehash('testing.eth'), sha3('sub3'), accounts[0])
    .send({ from: accounts[0] })
  nameLogger.record('testing.eth', { label: 'sub3', migrated: true })

  await setNewResolver('notsoawesome.eth')
  await addNewResolverAndRecords('abittooawesome.eth')
  /* Setup some domains for subdomain testing */
  console.log('Setting up subdomaindummy.eth')
  await newEnsContract
    .setSubnodeOwner(
      namehash('subdomaindummy.eth'),
      sha3('original'),
      accounts[0]
    )
    .send({ from: accounts[0] })
  // Change the controller from migration registrarMigration to controller
  nameLogger.record('original.subdomaindummy.eth', {
    label: 'original',
    migrated: true,
  })

  console.log(
    `Add Controller ${newController._address}  to new base registrar`
  )
  await newBaseRegistrarContract
    .addController(newController._address)
    .send({ from: accounts[0] })
  await registerName(
    web3,
    accounts[0],
    newControllerContract,
    'aftermigration'
  )
  // Set default resolver to the new one

  await registerName(
    web3,
    accounts[0],
    newControllerContract,
    'postmigration'
  )
  nameLogger.record('postmigration.eth', {
    label: 'postmigration',
    migrated: true,
  })
  await newEnsContract
    .setSubnodeOwner(ROOT_NODE, sha3('reverse'), accounts[1])
    .send({ from: accounts[0] })
  nameLogger.record('reverse', { label: 'reverse', migrated: true })
  await newEnsContract
    .setSubnodeOwner(
      namehash('reverse'),
      sha3('addr'),
      newReverseRegistrar._address
    )
    .send({ from: accounts[1] })
  nameLogger.record('addr.reverse', { label: 'addr', migrated: true })
  async function setNewResolver(name) {
    await newEnsContract
      .setResolver(namehash(name), newResolver._address)
      .send({ from: accounts[0] })
  }

  await newTestRegistrarContract
    .register(sha3('example'), accounts[0])
    .send({ from: accounts[0] })
  nameLogger.record('example.test', { label: 'example', migrated: true })

  const baseDays = 60
  const beforeTime = new Date(
    (await web3.eth.getBlock('latest')).timestamp * 1000
  )
  await registerName(
    web3,
    accounts[0],
    newControllerContract,
    'justreleased',
    baseDays * DAYS
  )
  await registerName(
    web3,
    accounts[0],
    newControllerContract,
    'threedayspast',
    (baseDays - 3) * DAYS
  )
  nameLogger.record('threedayspast', { label: 'threedayspast', migrated: true })
  await registerName(
    web3,
    accounts[0],
    newControllerContract,
    'released',
    (baseDays - 15) * DAYS
  )
  nameLogger.record('released', { label: 'released', migrated: true })
  await registerName(
    web3,
    accounts[0],
    newControllerContract,
    'rele',
    (baseDays - 15) * DAYS
  )
  nameLogger.record('rele', { label: 'rele', migrated: true })
  await registerName(
    web3,
    accounts[0],
    newControllerContract,
    'rel',
    (baseDays - 15) * DAYS
  )
  nameLogger.record('rel', { label: 'rel', migrated: true })
  await registerName(
    web3,
    accounts[0],
    newControllerContract,
    'onedaypremium',
    (baseDays - 20) * DAYS
  )
  nameLogger.record('onedaypremium', {
    label: 'onedaypremium',
    migrated: true,
  })

  await registerName(
    web3,
    accounts[0],
    newControllerContract,
    'halfdaypremium',
    (baseDays - 20.5) * DAYS
  )
  nameLogger.record('halfdaypremium', {
    label: 'halfdaypremium',
    migrated: true,
  })
  nameLogger.record('justreleased', { label: 'justreleased', migrated: true })
  if(!dnssec){
    await advanceTime(web3, (baseDays + 90) * DAYS + 1)
    await mine(web3)  
  }
  const afterTime = new Date(
    (await web3.eth.getBlock('latest')).timestamp * 1000
  )
  console.log({ beforeTime, afterTime })

  await newEnsContract
    .setSubnodeOwner(namehash('data.eth'), sha3('eth-usd'), accounts[0])
    .send({ from: accounts[0] })
  await newEnsContract
    .setSubnodeOwner(namehash('ens.eth'), sha3('oracle'), accounts[0])
    .send({ from: accounts[0] })

  await addNewResolverAndRecords('eth-usd.data.eth')
  await newResolverContract.setAddr(namehash('eth-usd.data.eth'), dummyOracle._address).send({from: accounts[0]})
  await addNewResolverAndRecords('oracle.ens.eth')
  await newResolverContract.setText(
    namehash('oracle.ens.eth'),
    'algorithm',
    exponential ? 'exponential' : 'linear'
  ).send({from: accounts[0]})

  await newEnsContract
    .setResolver(namehash('abittooawesome2.eth'), newResolver._address)
    .send({ from: accounts[0] })

  await newResolverContract
    .setContenthash(namehash('abittooawesome2.eth'), deprecated_contenthash)
    .send({ from: accounts[0] })

    // Disabled for now as configureDomain is throwing errorr
    // await subdomainRegistrarContract.migrateSubdomain(namehash.hash("ismoney.eth"), sha3("eth")).send({from: accounts[0]})

  // Name wrapper
  try {
    var staticMetadataService = await deploy(
        web3,
        accounts[0],
        staticMetadataServiceJSON,
        'http://localhost:8080/name/0x{id}'
    )
    var nameWrapper = await deploy(
        web3,
        accounts[0],
        nameWrapperJSON,
        ens._address,
        newBaseRegistrar._address,
        staticMetadataService._address
    )
    var resolverWithNameWrapper = await deploy(
        web3,
        accounts[0],
        resolverJSON,
        ens._address,
        nameWrapper._address
    )
    await registerName(web3, accounts[0], controllerContract, 'wrappedname');
    nameLogger.record('wrappedname.eth', {label: 'wrappedname'});
    const wrappedNameDomain = namehash('wrappedname.eth')
    await ensContract.setResolver(wrappedNameDomain, resolverWithNameWrapper._address).send({from: accounts[0]});
    await resolverWithNameWrapper.methods.setAddr(wrappedNameDomain, accounts[0]).send({from: accounts[0]});
    const test = await newBaseRegistrarContract.setApprovalForAll(nameWrapper._address, true).send({from: accounts[0]});
    console.log('approval', test)
    await nameWrapperContract.wrapETH2LD('wrappedname', accounts[0], 0, resolverWithNameWrapper._address).send({from: accounts[0]});
  } catch (e) {
    console.log('Failed to register wrapped name', e)
  }

  let response = {
    emptyAddress: '0x0000000000000000000000000000000000000000',
    ownerAddress: accounts[0],
    bulkRenewalAddress: bulkRenewal._address,
    legacyAuctionRegistrarAddress: legacyAuctionRegistrar._address,
    oldEnsAddress: ens._address,
    oldContentResolverAddresses: [oldResolver._address],
    oldResolverAddresses: [resolver._address, oldResolver._address],
    oldControllerAddress: controller._address,
    oldBaseRegistrarAddress: oldBaseRegistrar._address,
    reverseRegistrarAddress: oldReverseRegistrar._address,
    ensAddress: newEns._address,
    registrarMigration: registrarMigration && registrarMigration._address,
    resolverAddress: newResolver._address,
    reverseRegistrarAddress:
      newReverseRegistrar && newReverseRegistrar._address,
    reverseRegistrarOwnerAddress: accounts[0],
    controllerAddress: newController._address,
    baseRegistrarAddress: newBaseRegistrar._address,
    exponentialPremiumPriceOracle: exponentialPremiumPriceOracle._address,
    dummyOracle: dummyOracle._address,
  }
  let config = {
    columns: {
      0: {
        alignment: 'left',
        width: 30,
      },
      1: {
        alignment: 'center',
        width: 50,
      },
    },
  }

  let contractNames = Object.keys(response)
  let contractAddressesTable = contractNames.map((key) => {
    return [key, response[key]]
  })
  let output = table(contractAddressesTable, config)
  console.log('Deployed contracts')
  console.log(output)
  console.log('Names')
  const labels = nameLogger.generateTable()
  response.labels = {}
  labels.map((l, i) =>
    i !== 0 ? (response.labels[l[3].slice(2)] = l[2]) : null
  )
  console.log(nameLogger.print())
  return response
}
export default deployENS
