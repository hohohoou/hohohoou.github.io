declare module 'virtual:hoho-model-transports' {
  const transports: import('./model-transport').ModelTransports;
  export default transports;
}
declare module 'virtual:hoho-opening-images' {
  const pack: {transport:import('./model-transport').ModelTransport;entries:{url:string;byteOffset:number;byteLength:number}[]} | null;
  export default pack;
}
