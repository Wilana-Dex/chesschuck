import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

const loader = new GLTFLoader()
loader.load('/assets/ChessGLB.glb', (gltf) => {
  gltf.scene.traverse((child) => {
    console.log(child.type, '|', child.name, '| pos:', 
      child.position.x.toFixed(2), 
      child.position.y.toFixed(2), 
      child.position.z.toFixed(2)
    )
  })
})