import { readFileSync } from 'node:fs';
import zlib from 'node:zlib';
function readPng(path){const buf=readFileSync(path);let off=8,w=0,h=0,ct=6;const idat=[];
 while(off<buf.length){const len=buf.readUInt32BE(off),type=buf.toString('ascii',off+4,off+8);const d=buf.subarray(off+8,off+8+len);
  if(type==='IHDR'){w=d.readUInt32BE(0);h=d.readUInt32BE(4);ct=d[9];}else if(type==='IDAT')idat.push(d);else if(type==='IEND')break;off+=12+len;}
 const ch=ct===6?4:ct===2?3:ct===0?1:2;const raw=zlib.inflateSync(Buffer.concat(idat));const stride=w*ch;const out=Buffer.alloc(h*stride);let p=0;
 for(let y=0;y<h;y++){const f=raw[p++];const line=raw.subarray(p,p+stride);p+=stride;const cur=out.subarray(y*stride,y*stride+stride);const prev=y?out.subarray((y-1)*stride,y*stride):null;
  for(let x=0;x<stride;x++){const a=x>=ch?cur[x-ch]:0,b=prev?prev[x]:0,c=(prev&&x>=ch)?prev[x-ch]:0;let v=line[x];
   if(f===1)v+=a;else if(f===2)v+=b;else if(f===3)v+=(a+b)>>1;else if(f===4){const pp=a+b-c,pa=Math.abs(pp-a),pb=Math.abs(pp-b),pc=Math.abs(pp-c);v+=(pa<=pb&&pa<=pc)?a:(pb<=pc?b:c);}
   cur[x]=v&255;}}
 return {w,h,ch,data:out};}
const toLin=(v)=>(v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4);
const labF=(t)=>(t>0.008856?Math.cbrt(t):7.787*t+16/116);
function LAB(r,g,b){const R=toLin(r/255),G=toLin(g/255),B=toLin(b/255);
 const X=(R*0.4124+G*0.3576+B*0.1805)/0.95047,Y=R*0.2126+G*0.7152+B*0.0722,Z=(R*0.0193+G*0.1192+B*0.9505)/1.08883;
 return [116*labF(Y)-16,500*(labF(X)-labF(Y)),200*(labF(Y)-labF(Z))];}
const [file,x0,y0,x1,y1]=[process.argv[2],...process.argv.slice(3,7).map(Number)];
const img=readPng(file);
// connected blobs of "cool" (b* < 0) and "saturated" (C > 20) pixels, 4-neighbour
function blobs(test){
  const W=x1-x0+1,H=y1-y0+1;const mask=new Uint8Array(W*H);
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){const i=((y+y0)*img.w+(x+x0))*img.ch;const [L,a,b]=LAB(img.data[i],img.data[i+1],img.data[i+2]);
    if(test(L,a,b))mask[y*W+x]=1;}
  const seen=new Uint8Array(W*H);const out=[];const st=[];
  for(let s=0;s<W*H;s++){if(!mask[s]||seen[s])continue;let n=0,minx=1e9,miny=1e9,maxx=-1,maxy=-1;st.push(s);seen[s]=1;
    while(st.length){const q=st.pop();const qx=q%W,qy=(q/W)|0;n++;if(qx<minx)minx=qx;if(qx>maxx)maxx=qx;if(qy<miny)miny=qy;if(qy>maxy)maxy=qy;
      const nb=[qx>0?q-1:-1,qx<W-1?q+1:-1,qy>0?q-W:-1,qy<H-1?q+W:-1];
      for(const t of nb)if(t>=0&&mask[t]&&!seen[t]){seen[t]=1;st.push(t);}}
    if(n>=300)out.push({n,box:[minx+x0,miny+y0,maxx+x0,maxy+y0]});}
  return out.sort((a,b)=>b.n-a.n);}
console.log(file, `field ${x0},${y0}-${x1},${y1}`);
console.log('  masses with b* < 0 (area >= 300):');
for(const b of blobs((L,a,bb)=>bb<0&&L>25&&L<96).slice(0,8)) console.log(`    ${String(b.n).padStart(6)} px  box ${b.box.join(',')}`);
console.log('  masses with C* > 20 (area >= 300):');
for(const b of blobs((L,a,bb)=>Math.hypot(a,bb)>20).slice(0,8)) console.log(`    ${String(b.n).padStart(6)} px  box ${b.box.join(',')}`);
