// Single source of truth for the pre-init ScxmlEditorAPI stub. `src/app/layout.tsx` embeds
// this exact script via `dangerouslySetInnerHTML` so it runs before React hydrates; tests
// execute this same string (via `new Function`) so a change to the queued-call shape here
// is exercised by the real producer, not a hand-rolled mock of it.
export const PRE_READY_STUB_SCRIPT = `(function(){
  if(window.ScxmlEditorAPI)return;
  var q={ready:[],commands:[],ops:[]};
  window.ScxmlEditorAPI={
    _q:q,
    onReady:function(cb){q.ready.push(cb);},
    registerCommand:function(o){q.commands.push(o);},
    showFeedback:function(m,l){q.ops.push({type:'feedback',message:m,level:l});},
    setChannels:function(c){q.channels=c;},
    showErrors:function(errors){q.ops.push({type:'showErrors',errors:errors});},
    clearErrors:function(){q.ops.push({type:'clearErrors'});},
    loadScxml:function(){},
    getScxml:function(){return'';},
    toggleConfigPanel:function(){},
    setActiveTab:function(){}
  };
})();`;
