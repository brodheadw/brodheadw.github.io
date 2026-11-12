import {SatelliteCatalog} from '../astro/satellites.js';

let catalog;
self.onmessage=async({data:{method,args={},requestId}})=>{
  try {
    let result;
    if(method==='load') {
      const response=await fetch(new URL(args.url,self.location.href.includes('/js/data/')?new URL('../../',self.location.href):self.location.href));
      if(!response.ok) {
        let status;try{status=await (await fetch(new URL('../../data/satellites/status.json',import.meta.url))).json();}catch{}
        throw new Error(status?.error||`Satellite snapshot unavailable (HTTP ${response.status}). Run the scheduled data publisher.`);
      }
      const snapshot=await response.json();
      let satcat={objects:[]};
      try {const metadata=await fetch(new URL('satcat.json',response.url));if(metadata.ok)satcat=await metadata.json();}catch{}
      catalog=new SatelliteCatalog(snapshot,satcat);result={objects:catalog.objects,snapshot:{...snapshot,objects:undefined}};
    } else {
      if(!catalog)throw new Error('Satellite snapshot has not loaded');
      if(method==='update') {
        result=catalog.update(args.date,args.observer,args.eop);
        const buffers=[result.positions,result.velocities,result.temePositions,result.temeVelocities,result.geodetic,result.valid,result.visible,result.sunlit].map(array=>array.buffer);
        self.postMessage(result,buffers);return;
      }
      if(!['details','passes','measure','closeApproaches','statistics'].includes(method))throw new Error('Unknown satellite request');
      result=await catalog[method]({...args,onProgress:(fraction)=>self.postMessage({type:'progress',method,fraction})});
    }
    self.postMessage({requestId,result});
  } catch(error) {self.postMessage(requestId!=null?{requestId,error:error.message}:{type:'error',error:error.message});}
};
