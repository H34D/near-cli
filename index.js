const nearjs = require('nearlib');
const { KeyPair, keyStores } = require('nearlib');
const UnencryptedFileSystemKeyStore = keyStores.UnencryptedFileSystemKeyStore;
const fs = require('fs');
const yargs = require('yargs');
const ncp = require('ncp').ncp;
const rimraf = require('rimraf');

ncp.limit = 16;

// TODO: Fix promisified wrappers to handle error properly

exports.newProject = async function(options) {
  // Need to wait for the copy to finish, otherwise next tasks do not find files.
  const projectDir = options.projectDir;
  const sourceDir = __dirname + "/blank_project";
  console.log(`Copying files to new project directory (${projectDir}) from template source (${sourceDir}).`);
  const copyDirFn = () => {
      return new Promise(resolve => {
          ncp (sourceDir, options.projectDir, response => resolve(response));
  })};
  await copyDirFn();
  console.log('Copying project files complete.')
};

exports.clean = async function() {
  const rmDirFn = () => {
      return new Promise(resolve => {
      rimraf(yargs.argv.outDir, response => resolve(response));
  })};
  await rmDirFn();
  console.log("Clean complete.");
};

async function connect(options) {
    if (options.keyPath === undefined && options.helperUrl === undefined) {
        const homeDir = options.homeDir || `${process.env.HOME}/.near`;
        options.keyPath = `${homeDir}/validator_key.json`;
    }
    // TODO: search for key store.
    const keyStore = new UnencryptedFileSystemKeyStore('./neardev');
    options.deps = {
        keyStore,
    };
    return await nearjs.connect(options);
}

exports.createAccount = async function(options) {
    let near = await connect(options);
    const keyPair = await KeyPair.fromRandom('ed25519');
    await near.createAccount(options.accountId, keyPair.getPublicKey());
    near.connection.signer.keyStore.setKey(options.networkId, options.accountId, keyPair);
    console.log(`Account ${options.accountId} for network "${options.networkId}" was created.`);
}

exports.viewAccount = async function(options) {
    let near = await connect(options);
    let account = await near.account(options.accountId);
    let state = await account.state();
    console.log(`Account ${options.accountId}`);
    console.log(state);
}

exports.deploy = async function(options) {
    console.log(
        `Starting deployment. Account id: ${options.accountId}, node: ${options.nodeUrl}, helper: ${options.helperUrl}, file: ${options.wasmFile}`);
    const near = await connect(options);
    const contractData = [...fs.readFileSync(options.wasmFile)];
    const res = await near.waitForTransactionResult(
        await near.deployContract(options.accountId, contractData));
    if (res.status == "Completed") {
        console.log("Deployment succeeded.");
    } else {
        console.log("Deployment transaction did not succeed: ", res);
        process.exit(1);
    }
};

exports.scheduleFunctionCall = async function(options) {
    console.log(`Scheduling a call: ${options.contractName}.${options.methodName}(${options.args || ''})` +
        (options.amount ? ` with attached ${options.amount} NEAR` : ''));
    const near = await connect(options);
    console.log('Result:', await near.waitForTransactionResult(
        await near.scheduleFunctionCall(options.amount, options.accountId,
            options.contractName, options.methodName, JSON.parse(options.args || '{}'))));
};

exports.sendTokens = async function(options) {
    console.log(`Sending ${options.amount} NEAR to ${options.receiver}`);
    const near = await connect(options);
    await near.waitForTransactionResult(
        await near.sendTokens(options.amount, options.accountId, options.receiver));
};

exports.callViewFunction = async function(options) {
    console.log(`View call: ${options.contractName}.${options.methodName}(${options.args || ''})`);
    const near = await connect(options);
    console.log('Result:', await near.callViewFunction(options.contractName, options.methodName, JSON.parse(options.args || '{}')));
};

exports.stake = async function(options) {
    console.log(`Staking ${options.amount} on ${options.accountId} with public key = ${options.publicKey}.`);
    const near = await connect(options);
    const account = await near.account(options.accountId);
    const result = await account.stake(options.publicKey, BigInt(options.amount));
    console.log('Result: ', JSON.stringify(result));
}

exports.login = async function(options) {
    if (!options.walletUrl) {
        console.log("Log in is not needed on this environment. Please use appropriate master account for shell operations.")
    } else {
        const newUrl = new URL(options.walletUrl);
        const title = 'NEAR Shell';
        newUrl.searchParams.set('title', title);
        const keyPair = await KeyPair.fromRandom('ed25519');
        newUrl.searchParams.set('public_key', keyPair.getPublicKey());
        newUrl.searchParams.set('account_id', options.accountId)
        console.log(`Please navigate to this url and follow the insturctions to log in: ${newUrl.toString()}`);
    }
}
