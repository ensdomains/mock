import {
    DAYS,
    advanceTime,
    mine,
    registerName,
    loadContract,
    deploy,
} from './utils'
import packet from "dns-packet";

async function deployNameWrapper({ 
    web3, 
    accounts, 
    newEns, 
    newEnsContract, 
    newBaseRegistrar, 
    newBaseRegistrarContract,
    newControllerContract,
    nameLogger
}) {

    const { sha3 } = web3.utils
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

    function encodeName(name) {
        return '0x' + packet.name.encode(name).toString('hex')
      }

    try {

        const staticMetadataServiceJSON = loadContract('wrapper', 'StaticMetadataService')
        var staticMetadataService = await deploy(
            web3,
            accounts[0],
            staticMetadataServiceJSON,
            'http://localhost:8080/name/0x{id}'
        )

        const nameWrapperJSON = loadContract('wrapper', 'NameWrapper')
        var nameWrapper = await deploy(
            web3,
            accounts[0],
            nameWrapperJSON,
            newEns._address,
            newBaseRegistrar._address,
            staticMetadataService._address
        )

        const nameWrapperContract = nameWrapper.methods

        await nameWrapperContract.setController(accounts[0], true).send({from: accounts[0]})

        const resolverJSON = loadContract('resolvers', 'PublicResolver')
        var resolverWithNameWrapper = await deploy(
            web3,
            accounts[0],
            resolverJSON,
            newEns._address,
            nameWrapper._address
        )

        console.log('setting namewrapper approval for registrar and registry');
        await newBaseRegistrarContract.setApprovalForAll(nameWrapper._address, true)
        .send({from: accounts[0]});

        await newEnsContract.setApprovalForAll(nameWrapper._address, true)
        .send({from: accounts[0]})

    /** 
     * @name wrappedname.eth
     * @desc mock data for a properly wrapped domain 
     */
    await registerName(web3, accounts[0], newControllerContract, 'wrappedname');
    console.log('addint to name logger');
    nameLogger.record('wrappedname.eth', {label: 'wrappedname'});
    console.log('asserting results');
    const owner1 = await newEnsContract.owner(namehash('wrappedname.eth')).call();
    console.log(owner1);
    // assert((await newEnsContract.owner(namehash('wrappedname.eth')).call()) === accounts[0], 'check owner of wrappedname.eth');

    /** 
    * @name subdomain.wrappedname.eth
    * @desc mock data for a properly wrapped subdomain
   */
     console.log('registering subdomain.wrappedname.eth');
     await newEnsContract
         .setSubnodeOwner(namehash('wrappedname.eth'), sha3('subdomain'), accounts[0])
         .send({ from: accounts[0], gas: 6700000 })
     nameLogger.record('subdomain.wrappedname.eth', {label: 'subdomain.wrappedname.eth'})
    //  assert((await newEnsContract.owner(namehash('subdomain.wrappedname.eth')).call()) === accounts[0], 'check owner of subdomain')

    /**
         * @name unwrapped.wrappedname.eth
         * @desc mock data for a subdomain that is not wrapped while the parent domain is.
         */
      console.log('register unwrapped.wrapped.eth');
      await newEnsContract
      .setSubnodeOwner(namehash('wrappedname.eth'), sha3('unwrapped'), accounts[0])
      .send({ from: accounts[0] })
      nameLogger.record('unwrapped.wrappedname.eth', {label: 'unwrapped.wrappedname.eth'})
    //   assert((await newEnsContract.owner(namehash('unwrapped.wrappedname.eth')).call()) === accounts[0], 'check owner of subdomain')

       /**
     * @name expiredwrappedname.eth
     * @desc mock data for a domain that was wrapped but expired and repurchased
     */
    const expiredDomainDurationDays = 60
     await registerName(web3, accounts[0], newControllerContract, 'expiredwrappedname', expiredDomainDurationDays * DAYS);
     nameLogger.record('expiredwrappedname.eth', {label: 'expiredwrappedname'});
    //  assert((await newEnsContract.owner(namehash('expiredwrappedname.eth')).call()) === accounts[0], 'check owner of expiredwrappedname.eth');

     // Setting up wrappedname.eth
    console.log('wrapping wrappedname')
    await nameWrapperContract.wrapETH2LD('wrappedname', accounts[0], 0, resolverWithNameWrapper._address)
        .send({from: accounts[0], gas: 6700000})

    console.log('asserting ownership')
    const wrappedOwner = await nameWrapperContract.ownerOf(
        namehash('wrappedname.eth')
    ).call();
    // assert(wrappedOwner === accounts[0], 'wrappedname.eth is owned by accounts[0]');

    // assert((await newEnsContract.owner(namehash('expiredwrappedname.eth')).call()) === accounts[0], 'check owner of expiredwrappedname.eth');

    // Setting up subdomain.wrappedname.eth
    console.log('wrapping subdomain.wrappedname')
    await nameWrapperContract.wrap(
        encodeName('subdomain.wrappedname.eth'),
        accounts[0],
        0,
        resolverWithNameWrapper._address
    ).send({from: accounts[0], gas: 6700000})

    console.log('asserting owenership of subdomain.wrappendname.eth');
    const wrappedSubOnwer = await nameWrapperContract.ownerOf(
        namehash('subdomain.wrappedname.eth')
    ).call()
    // assert(wrappedSubOnwer === accounts[0], 'subdomain.wrappedname.eth is owned by accounts[0]')

      
    // Setting up expiredwrappedname.eth
     console.log('wrapping expiredwrappedname')
     await nameWrapperContract.wrapETH2LD('expiredwrappedname', accounts[0], 0, resolverWithNameWrapper._address)
         .send({from: accounts[0], gas: 6700000})
 
    await advanceTime(web3, (6 * 31 + expiredDomainDurationDays) * DAYS);
    await mine(web3);

    // assert(await newControllerContract.available('expiredwrappedname').call() === true, 'expiredwrappedname is available');
    await registerName(web3, accounts[0], newControllerContract, 'expiredwrappedname');

     console.log('asserting ownership')
     const expiredWrappedDomainOwner = await newEnsContract.owner(namehash('expiredwrappedname.eth')).call();
    //  assert(expiredWrappedDomainOwner === accounts[0], 'expiredwrappedname.eth is ownned by accounts[0]')

     console.log('asserting namewrapper ownership');
     const expiredwrappedOwner = await nameWrapperContract.ownerOf(
         namehash('expiredwrappedname.eth')
     ).call();
    //  assert(expiredwrappedOwner === accounts[0], 'expiredwrappedname.eth name wrapper is owned by accounts[0]');

     return {
         nameWrapperAddress: nameWrapper._address
     }
  } catch (e) {
    console.log('Failed to register wrapped name')
    console.log('ERROR', e);
    process.exit()
  }
}
export default deployNameWrapper
