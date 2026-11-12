import {SatelliteCatalog} from '../astro/satellites.js';
import {importedSnapshot,MAX_OMM_BYTES} from './omm-import.js';

let catalog,pendingCatalog,sourceGeneration=0,catalogGeneration=0;
self.onmessage=async({data:{method,args={},requestId}})=>{
  try {
    let result;
    if(method==='cancelSource') {sourceGeneration++;pendingCatalog=null;result=null;}
    else if(method==='commitSource') {
      if(!pendingCatalog||pendingCatalog.generation!==args.generation||sourceGeneration!==args.generation)throw new Error('Superseded satellite source request');
      catalog=pendingCatalog.catalog;catalogGeneration=pendingCatalog.generation;pendingCatalog=null;result={generation:catalogGeneration};
    } else if(method==='import') {
      const generation=++sourceGeneration;pendingCatalog=null;
      if(typeof args.text!=='string'||args.text.length>MAX_OMM_BYTES)throw new Error('OMM JSON import is too large (64 MB maximum).');
      const snapshot=importedSnapshot(JSON.parse(args.text),args);
      const next=new SatelliteCatalog(snapshot);
      pendingCatalog={catalog:next,generation};result={objects:next.objects,snapshot:{...snapshot,objects:undefined},generation};
      if(!args.prepareOnly){catalog=next;catalogGeneration=generation;pendingCatalog=null;}
    } else if(method==='load') {
      const generation=++sourceGeneration;pendingCatalog=null;
      const response=await fetch(new URL(args.url,self.location.href.includes('/js/data/')?new URL('../../',self.location.href):self.location.href));
      if(!response.ok) {
        let status;try{status=await (await fetch(new URL('../../data/satellites/status.json',import.meta.url))).json();}catch{}
        throw new Error(status?.error||`Satellite snapshot unavailable (HTTP ${response.status}). Run the scheduled data publisher.`);
      }
      const snapshot=await response.json();
      let satcat={objects:[]};
      try {const metadata=await fetch(new URL('satcat.json',response.url));if(metadata.ok)satcat=await metadata.json();}catch{}
      const next=new SatelliteCatalog(snapshot,satcat);
      if(generation!==sourceGeneration)throw new Error('Superseded satellite source request');
      pendingCatalog={catalog:next,generation};result={objects:next.objects,snapshot:{...snapshot,objects:undefined},generation};
      if(!args.prepareOnly){catalog=next;catalogGeneration=generation;pendingCatalog=null;}
    } else {
      if(!catalog)throw new Error('Satellite snapshot has not loaded');
      if(method==='update') {
        result=catalog.update(args.date,args.observer,args.eop);result.sourceGeneration=catalogGeneration;
        const buffers=[result.positions,result.velocities,result.temePositions,result.temeVelocities,result.geodetic,result.valid,result.visible,result.sunlit].map(array=>array.buffer);
        self.postMessage(result,buffers);return;
      }
      if(!['details','passes','measure','closeApproaches','statistics'].includes(method))throw new Error('Unknown satellite request');
      result=await catalog[method]({...args,onProgress:(fraction)=>self.postMessage({type:'progress',method,fraction})});
    }
    self.postMessage({requestId,result});
  } catch(error) {self.postMessage(requestId!=null?{requestId,error:error.message}:{type:'error',error:error.message});}
};
