import { useEffect, useRef, useState } from 'react';
import { endereco, type Reserva } from './model';
const key=import.meta.env.VITE_GOOGLE_MAPS_KEY;
let ready:Promise<void>|undefined;
function load() {
 if(!ready) ready=new Promise<void>((resolve,reject)=>{
  const script=document.createElement('script');
  const timeout=setTimeout(()=>reject(new Error('Tempo limite do mapa')),15000);
  const callbacks=window as Window & { iniciarMapa?:()=>void; gm_authFailure?:()=>void };
  callbacks.iniciarMapa=()=>{clearTimeout(timeout);resolve();};
  callbacks.gm_authFailure=script.onerror=()=>{clearTimeout(timeout);reject(new Error('Falha no Google Maps'));};
  script.src='https://maps.googleapis.com/maps/api/js?key='+encodeURIComponent(key)+'&loading=async&callback=iniciarMapa&language=pt-BR&region=BR';
  document.head.append(script);
 }).catch(error=>{ready=undefined;throw error;});
 return ready;
}
export type Parada={reserva:Reserva; ponto?:google.maps.LatLng; invalido?:boolean};
export function Mapa({reservas,saida,onParadas}:{reservas:Reserva[];saida:string;onParadas:(p:Parada[])=>void}) {
 const ref=useRef<HTMLDivElement>(null);
 const [message,setMessage]=useState('');
 useEffect(()=>{
  let active=true;
  const fallback=reservas.map(reserva=>({reserva}));
  onParadas(fallback);
  ref.current?.replaceChildren();
  setMessage(key?'Carregando mapa…':'Configure a chave do Google Maps para visualizar o mapa.');
  if(!key) return;
  async function run() {
   await load();
   const [{Map},{Geocoder},{Marker}]=await Promise.all([
    google.maps.importLibrary('maps') as Promise<google.maps.MapsLibrary>,
    google.maps.importLibrary('geocoding') as Promise<google.maps.GeocodingLibrary>,
    google.maps.importLibrary('marker') as Promise<google.maps.MarkerLibrary>,
   ]);
   const coder=new Geocoder();
   const locate=async(address:string)=>{
    try {
     const {results}=await coder.geocode({address,region:'BR',fulfillOnZeroResults:true});
     return results[0]?.partial_match ? undefined : results[0]?.geometry.location;
    } catch(error) {
     if(String(error).includes('ZERO_RESULTS')) return undefined;
     throw error;
    }
   };
   const found:Parada[]=[];
   for(const reserva of reservas) {
    if(!active) return;
    const ponto=await locate(endereco(reserva));
    found.push({reserva,ponto,invalido:!ponto});
   }
   let ordered=found;
   let notice='';
   if(saida && found.some(p=>p.ponto && p.reserva.entrega==='pendente')) {
    try {
     let origin=await locate(saida);
     if(!origin) throw new Error('Confira o endereço de saída.');
     const {Route}=await google.maps.importLibrary('routes') as google.maps.RoutesLibrary;
     const remaining=found.filter(p=>p.ponto && p.reserva.entrega==='pendente');
     const stops:Parada[]=[];
     while(remaining.length && active) {
      const distances=await Promise.all(remaining.map(async p=>{
       try {
        const {routes}=await Route.computeRoutes({origin:origin!,destination:p.ponto!,travelMode:'DRIVING',fields:['distanceMeters']});
        return routes?.[0]?.distanceMeters ?? Infinity;
       } catch { return Infinity; }
      }));
      const closest=Math.min(...distances);
      if(!Number.isFinite(closest)) {notice='Há entregas sem rota de carro calculada.';break;}
      const next=remaining.splice(distances.indexOf(closest),1)[0];
      stops.push(next);
      origin=next.ponto;
     }
     ordered=[...stops,...found.filter(p=>!stops.includes(p))];
    } catch {notice='Confira o endereço de saída e a configuração da API de rotas.';}
   }
   if(!active || !ref.current) return;
   const map=new Map(ref.current,{center:{lat:-8.05,lng:-34.9},zoom:11,streetViewControl:false,mapTypeControl:false});
   const bounds=new google.maps.LatLngBounds();
   ordered.forEach(({ponto,reserva},i)=>{
    if(!ponto || reserva.entrega==='cancelada') return;
    new Marker({map,position:ponto,label:String(i+1),title:reserva.nome});
    bounds.extend(ponto);
   });
   if(!bounds.isEmpty()) map.fitBounds(bounds,60);
   onParadas(ordered);
   setMessage(notice);
  }
  run().catch(()=>{if(active)setMessage('Mapa indisponível. Use os links de navegação na lista.');});
  return ()=>{active=false;};
 },[reservas,saida,onParadas]);
 return <section className="card"><h2>Mapa de entregas</h2>{message && <p className="muted" role="status">{message}</p>}<div ref={ref} className={key?'h-72 rounded-xl overflow-hidden bg-stone-100 mt-3':''}/></section>;
}
