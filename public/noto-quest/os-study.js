/* Layout coordinates are fractions of the stage. Each atlas uses the same camera as its detail image. */
const studyLayouts = [
  {id:'meta', cell:2.85, sourceWidth:582, order:[1,2,3,0], delays:[.02,.12,0,.075],
   mobile:[[.25,.34,.31],[.68,.32,.38],[.25,.615,.29],[.68,.61,.32]],
   wide:[[.15,.43,.15],[.40,.51,.21],[.64,.39,.145],[.84,.53,.14]]},
  {id:'os', cell:3.90, sourceWidth:811, order:[2,3,0,1], delays:[0,.13,.045,.08],
   mobile:[[.235,.34,.292],[.683,.32,.397],[.27,.625,.337],[.683,.615,.31]],
   wide:[[.16,.48,.149],[.405,.39,.216],[.64,.56,.17],[.835,.46,.152]]},
  {id:'prime', cell:6.25, sourceWidth:986, order:[0], delays:[0],
   mobile:[[.5,.39,.63]], wide:[[.47,.47,.35]]},
  {id:'projects', cell:3.90, sourceWidth:795, order:[3,2,4,1,0], delays:[.07,.02,.14,0,.09],
   mobile:[[.24,.237,.29],[.69,.23,.29],[.466,.458,.315],[.215,.70,.275],[.70,.69,.29]],
   wide:[[.145,.40,.137],[.329,.57,.149],[.515,.38,.153],[.69,.56,.135],[.86,.41,.143]]}
];

function createStoneStudy(layout, layerIndex) {
  const dir='assets/'+layout.id+'-study/';
  const worldWidth=layout.sourceWidth/180;
  const cell=layout.cell;
  const parts = [];
  const screenBounds = [];
  let pending;
  let pressed = null;
  let pressAmount = 0;
  const mix = (a, b, t) => a + (b - a) * t;
  const clamp = x => Math.max(0, Math.min(1, x));
  const ease = t => t*t*(3-2*t);

  function imageAt(url) {
    const im = new Image();
    im.src = url;
    return im.decode().then(() => im);
  }
  function load() {
    if (!pending) pending = (async () => {
      const response = await fetch(dir+'stones.json');
      if (!response.ok) throw Error('Missing stone geometry');
      const entries = await response.json();
      const images = await Promise.all(entries.map(async item => {
        const [atlas, detail] = await Promise.all([
          imageAt(dir+item.name+'-turn.webp'), imageAt(dir+item.name+'.webp')
        ]);
        return {...item, atlas, detail};
      }));
      parts.splice(0,parts.length,...images);
    })().catch(e => {pending = null; throw e;});
    return pending;
  }
  function press(index) { pressed = index; }
  function clearPress() { pressed = null; }
  function updatePress(dt, enabled) {
    const target = pressed === null ? 0 : 1;
    pressAmount = enabled ? mix(pressAmount,target,1-Math.exp(-dt*.38)) : 0;
    if (Math.abs(target-pressAmount)<.005) pressAmount=target;
    return pressAmount;
  }
  function draw(ctx, width, height, t, parent, layer, hits) {
    const mobile = width < 800;
    const span = Math.min(width,1180), left=(width-span)/2;
    const placement=mobile ? layout.mobile : layout.wide;
    const delays=layout.delays;
    const originScale=parent.w/worldWidth;
    // The intact layer gives way to the four reassembled solids over their first few pixels.
    const handover=clamp(t/.12);
    if(handover<1) {
      ctx.globalAlpha=1-handover;
      ctx.drawImage(layer.sprite,parent.x,parent.y,parent.w,parent.h);
      ctx.globalAlpha=1;
    }
    for (const j of layout.order) {
      const p=parts[j], b=p.finish;
      const u=clamp((t-delays[j])/(1-delays[j])), travel=ease(u);
      const startX=parent.x+parent.w/2+p.center[0]*originScale;
      const startY=parent.y+parent.h/2-p.center[2]*originScale;
      const [targetX,targetY,widthFraction]=placement[j];
      const maxHeight=mobile&&layout.id==='projects' ? height*.145 : height*.24;
      const endSize=Math.min(span*widthFraction/(b[2]-b[0]),maxHeight/(b[3]-b[1]));
      const size=mix(originScale*cell,endSize,travel);
      const endX=left+span*targetX-( (b[0]+b[2])/2-.5 )*endSize;
      const endY=height*targetY-( (b[1]+b[3])/2-.5 )*endSize;
      const x=mix(startX,endX,travel)-size/2;
      const y=mix(startY,endY,travel)-size/2 - Math.sin(Math.PI*travel)*Math.min(19,height*.021)
                +(pressed===j ? 2*pressAmount : 0);
      const pose=Math.round(27*ease(clamp(u*1.08)));
      ctx.globalAlpha=handover;
      if(pose===27) {
        ctx.drawImage(p.detail,x+b[0]*size,y+b[1]*size,(b[2]-b[0])*size,(b[3]-b[1])*size);
      } else {
        const [w,h]=p.tile, a=p.bounds;
        ctx.drawImage(p.atlas,pose%7*w,Math.floor(pose/7)*h,w,h,
          x+a[0]*size,y+a[1]*size,(a[2]-a[0])*size,(a[3]-a[1])*size);
      }
      ctx.globalAlpha=1;
      const box={x:x+b[0]*size,y:y+b[1]*size,w:(b[2]-b[0])*size,h:(b[3]-b[1])*size};
      screenBounds[j]=box;
      const button=layer.partButtons[j], visible=t>.86 && layer.children.length>1;
      button.style.left=box.x+box.w/2+'px';
      button.style.top=box.y+box.h+(mobile?10:15)+'px';
      button.style.maxWidth=mobile?'42vw':'210px';
      button.style.visibility=visible?'visible':'hidden';
      button.style.opacity=clamp((t-.86)/.14);
      button.style.pointerEvents=visible?'auto':'none';
      if(visible) hits.push({...box,layer:layerIndex,part:j});
    }
  }
  function showDetail(key, img, animate) {
    const index=parts.findIndex(p=>p.name===key);
    if(index<0)return;
    const p=parts[index];
    img.getAnimations().forEach(a=>a.cancel());
    img.src=p.detail.src;
    img.width=p.detail.naturalWidth;
    img.height=p.detail.naturalHeight;
    img.hidden=false;
    const from=screenBounds[index], to=img.getBoundingClientRect();
    if(!animate || !from || !to.width)return;
    const host=document.querySelector('#architecture').getBoundingClientRect();
    const dx=host.left+from.x-to.left, dy=host.top+from.y-to.top;
    img.animate([{transform:'translate('+dx+'px,'+dy+'px) scale('+from.w/to.width+','+from.h/to.height+')'},
                 {transform:'none'}],{duration:580,easing:'cubic-bezier(.21,.72,.18,1)'});
  }
  return {load,draw,showDetail,press,clearPress,updatePress,get pressed(){return pressed;}};
}
const stoneStudies=studyLayouts.map(createStoneStudy);
