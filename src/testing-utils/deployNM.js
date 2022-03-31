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
import * as assert from "assert";
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


async function deployNM({ web3, accounts, dnssec = false, exponential = false }) {

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

    // const labelhash = (label) => utils.keccak256(utils.toUtf8Bytes(label))
    const labelhash = (label) => sha3(label)

    try {
        const account = accounts[0]
        const account2 = accounts[1]
        console.log('accounts', account, account2)

        console.log('deploying ens registry')
        const registryJSON = loadContract('registry', 'ENSRegistry')
        const EnsRegistry = await deploy(web3, account,
            registryJSON)
        // EnsRegistry2 = EnsRegistry.connect(signers[1])

        console.log('deploying base registrar')
        const baseRegistrarJSON = loadContract(
            'ethregistrar',
            'BaseRegistrarImplementation'
        )
        const BaseRegistrar = await deploy(
            web3,
            account,
            baseRegistrarJSON,
            EnsRegistry._address,
            namehash('eth')
        )
        // BaseRegistrar2 = BaseRegistrar.connect(signers[1])

        console.log('adding controllers to base registrar')
        await BaseRegistrar.methods.addController(account).send({from: account})
        await BaseRegistrar.methods.addController(account2).send({from: account})

        console.log('deploying static meta data service')
        const staticMetadataServiceJSON = loadContract('wrapper', 'StaticMetadataService')
        const MetaDataservice = await deploy(
            web3,
            account,
            staticMetadataServiceJSON,
            'https://ens.domains'
        )

        console.log('deploying name wrapper')
        const nameWrapperJSON = loadContract('wrapper', 'NameWrapper')
        const NameWrapper = await deploy(
            web3,
            account,
            nameWrapperJSON,
            EnsRegistry._address,
            BaseRegistrar._address,
            MetaDataservice._address
        )

        // NameWrapper2 = NameWrapper.connect(signers[1])

        console.log('setting up .eth')
        await EnsRegistry.methods.setSubnodeOwner(
            ROOT_NODE,
            sha3('eth'),
            // utils.keccak256(utils.toUtf8Bytes('eth')),
            BaseRegistrar._address
        ).send({from: account})

        console.log('setting up .xyz')
        await EnsRegistry.methods.setSubnodeOwner(
            ROOT_NODE,
            sha3('xyz'),
            // utils.keccak256(utils.toUtf8Bytes('xyz')),
            account
        ).send({from: account})

        console.log('check owner of .eth')
        const EnsRegistryOwner = await EnsRegistry.methods.owner(
            namehash('eth')).call()

        assert(BaseRegistrar._address === EnsRegistryOwner, '')
        if (BaseRegistrar._address === EnsRegistryOwner) console.log('Base registrar is owner of .eth')
       else console.log(BaseRegistrar._address, '/=', EnsRegistryOwner)

        console.log('setting approval for all on base register')
        await BaseRegistrar.methods
            .setApprovalForAll(NameWrapper._address, true)
            .send({from: account})

        console.log('registering domaihn with base registrar')
        await BaseRegistrar.methods
            .register(labelhash('test1'), account, 84600)
            .send({from: account, gas: 6700000})

        console.log('wrapping domain')
        await NameWrapper.methods.wrapETH2LD(
            'test1',
            account,
            0,
            ZERO_ADDRESS
        ).send({from: account, gas: 6700000})

        const domainOwner = await NameWrapper.methods.ownerOf(namehash('test1.eth')).call();
        console.log(domainOwner, '<---')

        const label = 'unwrapped'
        const labelHash = labelhash(label) // was labelhash

        console.log('registering', label, 'with base registrar')
        await BaseRegistrar.methods.register(labelHash, account, 84600)
            .send({from: account, gas: 6700000})

        await NameWrapper.methods.wrapETH2LD(label, account, 0, ZERO_ADDRESS)
            .send({from: account,  gas: 6700000})
        const ownerOfWrappedETH = await NameWrapper.methods.ownerOf(
            namehash('unwrapped.eth')
        ).call()

        console.log(ownerOfWrappedETH)

    } catch (e) {
        console.log('ERROR', e)
        process.exit()
    }
}
export default deployNM
