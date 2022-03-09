import deployTestEns from './deployENS.js'
import Web3 from 'web3'
import fs from 'fs'

let web3

async function getAccounts(web3) {
  return web3.eth.getAccounts()
}

async function setupWeb3(customProvider) {
  web3 = new Web3(customProvider)
  const networkId = await web3.eth.net.getId()

  return {
    web3,
    networkId
  }
}

export async function mockENS({dnssec, exponential}) {
  var provider = new Web3.providers.HttpProvider('http://localhost:8545')
  var { web3 } = await setupWeb3(provider)

  const accounts = await getAccounts(web3)

  const addresses = await deployTestEns({ web3, accounts, dnssec, exponential })
  const {
    ensAddress,
    controllerAddress,
    legacyAuctionRegistrarAddress
  } = addresses

  fs.writeFileSync('./cypress.env.json', JSON.stringify(addresses))
  fs.writeFile('./.env.local', `REACT_APP_ENS_ADDRESS=${ensAddress}`, err => {
    if (err) throw err
    console.log(`Successfully wrote ENS address ${ensAddress} to .env.local`)
  })
}
