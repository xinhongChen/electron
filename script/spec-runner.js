const cp = require('child_process')
const crypto = require('crypto')
const fs = require('fs')
const { hashElement } = require('folder-hash')
const path = require('path')

const BASE = path.resolve(__dirname, '../..')
const NPM_CMD = process.platform === 'win32' ? 'npm.cmd' : 'npm'

const specHashPath = path.resolve(__dirname, '../spec/.hash')
if (!fs.existsSync(specHashPath)) {
  fs.writeFileSync(specHashPath, 'invalid\ninvalid')
}

const [lastSpecHash, lastSpecInstallHash] = fs.readFileSync(specHashPath, 'utf8').split('\n')
getSpecHash().then(([currentSpecHash, currentSpecInstallHash]) => {
  const specChanged = currentSpecHash !== lastSpecHash
  const installChanged = lastSpecInstallHash !== currentSpecInstallHash
  if (specChanged || installChanged) {
    const out = cp.spawnSync(NPM_CMD, ['install'], {
      env: Object.assign({}, process.env, {
        npm_config_nodedir: path.resolve(BASE, 'out/Default/gen/node_headers'),
        npm_config_msvs_version: '2017'
      }),
      cwd: path.resolve(__dirname, '../spec')
    })
    if (out.status !== 0) {
      console.error('Failed to npm install in the spec folder')
      process.exit(1)
    }
    return getSpecHash()
      .then(([newSpecHash, newSpecInstallHash]) => {
        fs.writeFileSync(specHashPath, `${newSpecHash}\n${newSpecInstallHash}`)
      })
  }
}).then(() => {
  let exe = path.resolve(BASE, getOutPath())
  const args = process.argv.slice(2)
  if (process.platform === 'linux') {
    args.unshift(path.resolve(__dirname, 'lib/dbus_mock.py'), exe)
    exe = 'python'
  }
  const child = cp.spawn(exe, args, {
    cwd: path.resolve(__dirname, '../..'),
    stdio: 'inherit'
  })
  child.on('exit', (code) => {
    process.exit(code)
  })
})

function getOutPath () {
  switch (process.platform) {
    case 'darwin':
      return 'out/Default/Electron.app/Contents/MacOS/Electron'
    case 'win32':
      return 'out/Default/electron.exe'
    case 'linux':
      return 'out/Default/electron'
    default:
      throw new Error('Unknown path')
  }
}

function getSpecHash () {
  return Promise.all([
    new Promise((resolve) => {
      const hasher = crypto.createHash('SHA256')
      hasher.update(fs.readFileSync(path.resolve(__dirname, '../spec/package.json')))
      hasher.update(fs.readFileSync(path.resolve(__dirname, '../spec/package-lock.json')))
      resolve(hasher.digest('hex'))
    }),
    new Promise((resolve, reject) => {
      const specNodeModulesPath = path.resolve(__dirname, '../spec/node_modules')
      if (!fs.existsSync(specNodeModulesPath)) {
        return resolve('invalid')
      }
      hashElement(specNodeModulesPath).then((result) => resolve(result.hash)).catch(reject)
    })
  ])
}
