const COMM_TYPES = {
  JUPYTER: 'JUPYTER',
  COLAB: 'COLAB'
};

export default class CommAPI{
  constructor(api_call_id, callback, paramList) {
    this.paramList = paramList;
    this.callback = callback;
    this.mode = null;
    if (window.Jupyter !== undefined) {
      this.mode = COMM_TYPES.JUPYTER;
      this.comm = window.Jupyter.notebook.kernel.comm_manager.new_comm(api_call_id, {});
      this.comm.on_msg(msg => {
        const data = msg.content.data;
        console.log(data);
        callback(data);
      });
    } else if (window.google !== undefined) {
      this.mode = COMM_TYPES.COLAB;
      this.comm = async function(orderedParams){
        const result = await google.colab.kernel.invokeFunction(
          api_call_id,
          orderedParams, // The arguments.
          {}); // kwargs
        callback(result.data['application/json']);
      };
    } else {
      console.error(new Error("Cannot find Jupyter/Colab namespace from javascript"));
    }
  }

  call(msg) {
    if (this.comm){
      if (this.mode === COMM_TYPES.JUPYTER){
        this.comm.send(msg);
      } else if (this.mode === COMM_TYPES.COLAB){
        const orderedParams = this.paramList.map(param => msg[param]);
        this.comm(orderedParams);
      }
    }
  }
}