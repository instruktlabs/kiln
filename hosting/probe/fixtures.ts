// Fixed provider-qualification programs only. Never imported by production hosts.
export const engineRequest = new TextEncoder().encode(
  JSON.stringify({
    version: 'kiln.evaluator.request.v2',
    requestId: 'image-fixture',
    operation: 'execute-export-glb',
    code: 'function build(){return new THREE.Mesh(boxGeo(1,1,1),gameMaterial(0x8899aa));}',
    options: {},
    limits: { maxGlbBytes: 2097152 },
  }),
);

export const glbDigest = 'f94d231ed3eb4843a03704872adc3f20b00c2ea24567cb5916407b40a2cf1d40';

// The controller remains outside the VM. These deliberately bypass Node vm so
// network/filesystem checks exercise the provider boundary, not the JS sandbox.
const prefix = 'import fs from "node:fs";fs.readFileSync(0);';
const finish = 'fs.writeSync(1,JSON.stringify({ok:true}));process.exit(0);';
export const nativeFixtures: Record<string, string> = {
  network: `${prefix}
    const {connect}=await import('node:net');
    const {lookup}=await import('node:dns/promises');
    const targets=[['1.1.1.1',443],['169.254.169.254',80],['127.0.0.1',8000]];
    for(const [host,port] of targets){
      const connected=await new Promise(resolve=>{
        const socket=connect({host,port});
        const finish=value=>{socket.destroy();resolve(value);};
        socket.setTimeout(2000,()=>finish(false));
        socket.once('error',()=>finish(false));socket.once('connect',()=>finish(true));
      });
      if(connected)throw new Error('unexpected network access');
    }
    const resolved=await Promise.race([lookup('example.com').then(()=>true,()=>false),new Promise(resolve=>setTimeout(()=>resolve(false),2500))]);
    if(resolved)throw new Error('unexpected DNS resolution');
    ${finish}`,
  'write-marker': `${prefix}
    if(fs.existsSync('/tmp/kiln-qualification-marker'))throw new Error('unexpected old file');
    fs.writeFileSync('/tmp/kiln-qualification-marker','qualification-only');
    const {spawn}=await import('node:child_process');
    const child=spawn(process.execPath,['-e','process.title="kiln-qualification-child";setInterval(()=>{},1000)'],{detached:true,stdio:'ignore',env:{},cwd:'/tmp'});
    child.unref();
    await new Promise(resolve=>setTimeout(resolve,100));
    if(!Number.isSafeInteger(child.pid))throw new Error('child did not start');
    process.kill(child.pid,0);
    ${finish}`,
  'read-marker': `${prefix}
    if(fs.existsSync('/tmp/kiln-qualification-marker'))throw new Error('cross-job file');
    for(const pid of fs.readdirSync('/proc').filter(name=>/^\\d+$/.test(name)&&name!==String(process.pid))){
      let command='';try{command=fs.readFileSync('/proc/'+pid+'/cmdline','utf8');}catch{}
      if(command.includes('kiln-qualification-child'))throw new Error('cross-job child');
    }
    ${finish}`,
};
