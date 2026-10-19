'use strict';
(function(root, factory) {
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.GapWindowMetrics=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const WINDOWS=Object.freeze([400,300,200,100,50]);
  function latestRun(gaps){
    const ordered=[...gaps].sort((a,b)=>b.date.localeCompare(a.date));
    if(!ordered.length)return {direction:null,count:0,latest_date:null,earliest_date:null};
    const direction=ordered[0].direction;
    let count=0;
    for(const gap of ordered){if(gap.direction!==direction)break;count++;}
    return {direction,count,latest_date:ordered[0].date,earliest_date:ordered[count-1].date};
  }
  function windowView(row,window){
    if(!WINDOWS.includes(window))throw new RangeError('不支持的日K窗口');
    const bars=(row.bars||[]).slice(-window),start=bars[0]?.date||null,end=bars[bars.length-1]?.date||null;
    // Remaining intervals are independent of gaps formed before the window.
    // The server's 400-bar result also retains gaps on its first candle using
    // an extra predecessor, so filtering keeps that boundary observation.
    const gaps=start?(row.gaps||[]).filter(g=>g.date>=start&&g.date<=end):[];
    return {...row,bars,gaps,bar_count:bars.length,window_size:window,window_start:start,
      up_count:bars.length?gaps.filter(g=>g.direction==='up').length:null,
      down_count:bars.length?gaps.filter(g=>g.direction==='down').length:null,
      new_gaps:row.stale?[]:gaps.filter(g=>g.date===row.expected_session),
      latest_run:latestRun(gaps)};
  }
  return {WINDOWS,latestRun,windowView};
});
