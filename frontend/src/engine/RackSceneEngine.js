import {
  Engine,
  Scene,
  ArcRotateCamera,
  Vector3,
  HemisphericLight,
  DirectionalLight,
  Color3,
  Color4,
  MeshBuilder,
  StandardMaterial,
  Texture,
  DynamicTexture,
  Mesh,
  Animation,
  CubicEase,
  EasingFunction,
  DefaultRenderingPipeline,
  ShadowGenerator,
  PBRMaterial,
  GlowLayer,
  Matrix,
  Space
} from '@babylonjs/core'
import { useRackStore } from '@/store/rackStore'

const UNIT = 1.0
const TRACK_WIDTH = 0.15
const LAYER_HEIGHT = 4.5
const SHELF_HEIGHT = 3.5

export class RackSceneEngine {
  constructor(canvas) {
    this.canvas = canvas
    this.engine = null
    this.scene = null
    this.camera = null
    this.glowLayer = null

    this.store = null
    this.unwatchStore = null
    this.rackMeshes = new Map()
    this.shuttleMeshes = new Map()
    this.trackMeshes = new Map()
    this.cargoMeshes = new Map()
    this.powerLineMeshes = new Map()
    this.animatingShuttles = new Map()

    this.config = {
      rows: 5,
      cols: 8,
      layers: 3
    }

    this.shuttleColors = {}
    this.colorPalette = [
      '#00d4ff', '#ff6b9d', '#7cff6b', '#ffd166',
      '#c77dff', '#ff9a3c', '#48cae4', '#f72585'
    ]

    this.onShuttleClick = null
    this._boundRender = null
    this._resizeHandler = null
  }

  async init() {
    this.store = useRackStore()
    this.engine = new Engine(this.canvas, true, {
      preserveDrawingBuffer: true,
      stencil: true
    })
    this.scene = new Scene(this.engine)
    this.scene.clearColor = new Color4(0.03, 0.05, 0.10, 1.0)
    this.scene.autoClear = true

    this._setupCamera()
    this._setupLights()
    this._setupPostProcess()
    this._buildFloorGrid()

    this.config = {
      rows: this.store.rackConfig.rows,
      cols: this.store.rackConfig.cols,
      layers: this.store.rackConfig.layers
    }

    this._buildRackSystem()
    this._setupStoreWatchers()
    this._startRenderLoop()
  }

  _setupCamera() {
    const centerX = (this.config.cols - 1) * UNIT / 2
    const centerY = 0
    const centerZ = (this.config.rows - 1) * UNIT / 2

    this.camera = new ArcRotateCamera(
      'camera',
      -Math.PI / 3,
      Math.PI / 2.8,
      Math.max(this.config.rows, this.config.cols) * 2.8,
      new Vector3(centerX, LAYER_HEIGHT * this.config.layers / 2, centerZ),
      this.scene
    )
    this.camera.attachControl(this.canvas, true)
    this.camera.wheelPrecision = 30
    this.camera.lowerRadiusLimit = 4
    this.camera.upperRadiusLimit = Math.max(this.config.rows, this.config.cols) * 5
    this.camera.upperBetaLimit = Math.PI / 2.1
    this.camera.lowerBetaLimit = Math.PI / 6
    this.camera.inertia = 0.7
    this.camera.panningInertia = 0.7
  }

  _setupLights() {
    const hemi = new HemisphericLight('hemiLight', new Vector3(0.3, 1, 0.2), this.scene)
    hemi.intensity = 0.6
    hemi.groundColor = new Color3(0.15, 0.18, 0.25)

    const sun = new DirectionalLight('sunLight', new Vector3(-0.5, -1, -0.4), this.scene)
    sun.position = new Vector3(10, 30, 8)
    sun.intensity = 1.2

    this.shadowGenerator = new ShadowGenerator(2048, sun)
    this.shadowGenerator.useBlurExponentialShadowMap = true
    this.shadowGenerator.blurKernel = 16
  }

  _setupPostProcess() {
    this.pipeline = new DefaultRenderingPipeline('pipeline', true, this.scene, [this.camera])
    this.pipeline.samples = 4
    this.pipeline.fxaaEnabled = true
    this.pipeline.fxaa.samples = 4

    this.pipeline.bloomEnabled = true
    this.pipeline.bloomThreshold = 0.7
    this.pipeline.bloomWeight = 0.4
    this.pipeline.bloomKernel = 32
    this.pipeline.bloomScale = 0.5

    this.pipeline.samples = 4
    this.glowLayer = new GlowLayer('glow', this.scene, {
      mainTextureFixedSize: 512,
      blurKernelSize: 16
    })
  }

  _buildFloorGrid() {
    const totalWidth = this.config.cols * UNIT + 4
    const totalDepth = this.config.rows * UNIT + 4
    const ground = MeshBuilder.CreateGround('ground', {
      width: totalWidth,
      height: totalDepth,
      subdivisions: 50
    }, this.scene)
    ground.position = new Vector3(
      (this.config.cols - 1) * UNIT / 2,
      -0.01,
      (this.config.rows - 1) * UNIT / 2
    )

    const groundMat = new StandardMaterial('groundMat', this.scene)
    groundMat.emissiveColor = new Color3(0.04, 0.06, 0.1)
    groundMat.disableLighting = true
    ground.material = groundMat

    const gridSize = Math.max(this.config.cols, this.config.rows) * UNIT + 2
    for (let i = 0; i < this.config.layers + 1; i++) {
      const grid = MeshBuilder.CreateTiledGround(`floorGrid_${i}`, {
        xmin: -2, zmin: -2,
        xmax: this.config.cols * UNIT - 1 + 2,
        zmax: this.config.rows * UNIT - 1 + 2,
        subdivisions: { w: this.config.cols + 2, h: this.config.rows + 2 }
      }, this.scene)
      grid.position.y = i * LAYER_HEIGHT - 0.005
      grid.position.x = (this.config.cols - 1) * UNIT / 2
      grid.position.z = (this.config.rows - 1) * UNIT / 2

      const gridMat = new StandardMaterial(`gridMat_${i}`, this.scene)
      gridMat.emissiveColor = new Color3(0.08, 0.14, 0.25)
      gridMat.alpha = i === 0 ? 0.8 : 0.35
      gridMat.disableLighting = true
      gridMat.wireframe = true
      grid.material = gridMat
    }
  }

  _buildRackSystem() {
    for (let layer = 0; layer < this.config.layers; layer++) {
      this._buildSingleLayer(layer)
    }
    this._buildPowerLines()
    this._buildVerticalLift()
    this._buildChargingStation()
  }

  _buildSingleLayer(layer) {
    const baseY = layer * LAYER_HEIGHT

    for (let y = 0; y < this.config.rows; y++) {
      for (let x = 0; x < this.config.cols; x++) {
        this._buildTrackNode(x, y, layer, baseY)
      }
    }

    for (let y = 0; y < this.config.rows; y++) {
      for (let x = 0; x < this.config.cols; x++) {
        this._buildShelfUnit(x, y, layer, baseY)
      }
    }
  }

  _buildTrackNode(x, y, layer, baseY) {
    const trackNode = new Mesh(`track_${layer}_${y}_${x}`, this.scene)
    trackNode.position = new Vector3(x * UNIT, baseY + 0.02, y * UNIT)

    const plate = MeshBuilder.CreateBox(`trackPlate_${layer}_${y}_${x}`, {
      width: UNIT * 0.95,
      height: 0.06,
      depth: UNIT * 0.95
    }, this.scene)
    plate.parent = trackNode

    const plateMat = new StandardMaterial(`trackPlateMat_${layer}`, this.scene)
    plateMat.diffuseColor = new Color3(0.25, 0.3, 0.38)
    plateMat.specularColor = new Color3(0.1, 0.1, 0.15)
    plateMat.emissiveColor = new Color3(0.02, 0.04, 0.08)
    plate.material = plateMat
    this.shadowGenerator && this.shadowGenerator.addShadowCaster(plate)
    plate.receiveShadows = true

    const xRail = MeshBuilder.CreateBox(`xRail_${layer}_${y}_${x}`, {
      width: UNIT * 0.9,
      height: 0.04,
      depth: TRACK_WIDTH
    }, this.scene)
    xRail.parent = trackNode
    xRail.position.y = 0.04
    xRail.position.z = -UNIT * 0.2

    const yRail = MeshBuilder.CreateBox(`yRail_${layer}_${y}_${x}`, {
      width: TRACK_WIDTH,
      height: 0.04,
      depth: UNIT * 0.9
    }, this.scene)
    yRail.parent = trackNode
    yRail.position.y = 0.04
    yRail.position.x = -UNIT * 0.2

    const railMat = new StandardMaterial(`railMat_${layer}`, this.scene)
    railMat.diffuseColor = new Color3(0.55, 0.6, 0.68)
    railMat.specularColor = new Color3(0.8, 0.85, 0.9)
    railMat.specularPower = 64
    railMat.emissiveColor = new Color3(0.05, 0.08, 0.12)
    xRail.material = railMat
    yRail.material = railMat

    const key = `${layer}-${y}-${x}`
    this.trackMeshes.set(key, trackNode)

    const cargoKey = `cargo_${key}`
    if (Math.random() < 0.25 && !(x === 0 && y === 0)) {
      this._buildCargoBox(x, y, layer, baseY, cargoKey)
    }
  }

  _buildCargoBox(x, y, layer, baseY, cargoKey) {
    const cargo = MeshBuilder.CreateBox(cargoKey, {
      width: UNIT * 0.55,
      height: UNIT * 0.5,
      depth: UNIT * 0.55
    }, this.scene)
    cargo.position = new Vector3(x * UNIT, baseY + 0.08 + UNIT * 0.25, y * UNIT)

    const cargoMat = new StandardMaterial(`cargoMat_${cargoKey}`, this.scene)
    const hue = Math.floor(Math.random() * 360)
    cargoMat.diffuseColor = Color3.FromHSV(hue, 0.35, 0.9)
    cargoMat.emissiveColor = Color3.FromHSV(hue, 0.15, 0.2)
    cargoMat.specularColor = new Color3(0.1, 0.1, 0.1)
    cargo.material = cargoMat
    this.shadowGenerator && this.shadowGenerator.addShadowCaster(cargo)
    cargo.receiveShadows = true

    const band = MeshBuilder.CreateBox(`band_${cargoKey}`, {
      width: UNIT * 0.57,
      height: 0.04,
      depth: UNIT * 0.57
    }, this.scene)
    band.parent = cargo
    band.position.y = 0
    const bandMat = new StandardMaterial(`bandMat_${cargoKey}`, this.scene)
    bandMat.diffuseColor = new Color3(0.15, 0.15, 0.2)
    bandMat.emissiveColor = new Color3(0.3, 0.05, 0.05)
    band.material = bandMat

    this.cargoMeshes.set(cargoKey, cargo)
  }

  _buildShelfUnit(x, y, layer, baseY) {
    const frameKey = `shelfFrame_${layer}_${y}_${x}`
    const frame = new Mesh(frameKey, this.scene)
    frame.position = new Vector3(x * UNIT, baseY + 0.05, y * UNIT)

    const buildPillar = (posX, posZ, name) => {
      const p = MeshBuilder.CreateBox(name, {
        width: 0.08,
        height: SHELF_HEIGHT,
        depth: 0.08
      }, this.scene)
      p.parent = frame
      p.position = new Vector3(posX, SHELF_HEIGHT / 2, posZ)
      const pillarMat = new StandardMaterial(`pillar_${name}`, this.scene)
      pillarMat.diffuseColor = new Color3(0.45, 0.48, 0.55)
      pillarMat.specularColor = new Color3(0.2, 0.2, 0.25)
      p.material = pillarMat
      this.shadowGenerator && this.shadowGenerator.addShadowCaster(p)
      return p
    }

    const off = UNIT * 0.4
    buildPillar(-off, -off, `p1_${frameKey}`)
    buildPillar(off, -off, `p2_${frameKey}`)
    buildPillar(-off, off, `p3_${frameKey}`)
    buildPillar(off, off, `p4_${frameKey}`)

    const beam1 = MeshBuilder.CreateBox(`beam1_${frameKey}`, {
      width: UNIT * 0.85, height: 0.06, depth: 0.06
    }, this.scene)
    beam1.parent = frame
    beam1.position = new Vector3(0, SHELF_HEIGHT, -off)

    const beam2 = MeshBuilder.CreateBox(`beam2_${frameKey}`, {
      width: UNIT * 0.85, height: 0.06, depth: 0.06
    }, this.scene)
    beam2.parent = frame
    beam2.position = new Vector3(0, SHELF_HEIGHT, off)

    const beam3 = MeshBuilder.CreateBox(`beam3_${frameKey}`, {
      width: 0.06, height: 0.06, depth: UNIT * 0.85
    }, this.scene)
    beam3.parent = frame
    beam3.position = new Vector3(-off, SHELF_HEIGHT, 0)

    const beam4 = MeshBuilder.CreateBox(`beam4_${frameKey}`, {
      width: 0.06, height: 0.06, depth: UNIT * 0.85
    }, this.scene)
    beam4.parent = frame
    beam4.position = new Vector3(off, SHELF_HEIGHT, 0)

    const beamMat = new StandardMaterial(`beamMat_${frameKey}`, this.scene)
    beamMat.diffuseColor = new Color3(0.55, 0.4, 0.3)
    beamMat.specularColor = new Color3(0.1, 0.08, 0.05)
    beam1.material = beamMat
    beam2.material = beamMat
    beam3.material = beamMat
    beam4.material = beamMat
    ;[beam1, beam2, beam3, beam4].forEach(b => {
      this.shadowGenerator && this.shadowGenerator.addShadowCaster(b)
    })

    this.rackMeshes.set(frameKey, frame)
  }

  _buildPowerLines() {
    for (let layer = 0; layer < this.config.layers; layer++) {
      const baseY = layer * LAYER_HEIGHT + SHELF_HEIGHT + 0.3

      const xLine = MeshBuilder.CreateCylinder(`powerX_${layer}`, {
        height: this.config.cols * UNIT,
        diameter: 0.06,
        tessellation: 8
      }, this.scene)
      xLine.rotation.z = Math.PI / 2
      xLine.position = new Vector3(
        (this.config.cols - 1) * UNIT / 2,
        baseY,
        0
      )

      const xLineMat = new PBRMaterial(`powerXMat_${layer}`, this.scene)
      xLineMat.albedoColor = new Color3(0.8, 0.7, 0.2)
      xLineMat.emissiveColor = new Color3(0.3, 0.25, 0.05)
      xLineMat.metallic = 0.8
      xLineMat.roughness = 0.3
      xLine.material = xLineMat
      this.glowLayer && this.glowLayer.addIncludedOnlyMesh(xLine)

      for (let y = 0; y < this.config.rows; y++) {
        const yLine = MeshBuilder.CreateCylinder(`powerY_${layer}_${y}`, {
          height: this.config.rows * UNIT * 0.0,
          diameter: 0.06
        }, this.scene)
        const ySeg = MeshBuilder.CreateCylinder(`powerYS_${layer}_${y}`, {
          height: (this.config.rows - 1) * UNIT,
          diameter: 0.05,
          tessellation: 8
        }, this.scene)
        ySeg.position = new Vector3(
          0,
          baseY,
          (this.config.rows - 1) * UNIT / 2
        )
        ySeg.parent = null
        const group = new Mesh(`powerYGroup_${layer}_${y}`, this.scene)
        group.position.x = y * 0 + (y === 0 ? 0 : 0)
        ySeg.setParent(group)
        group.position = new Vector3(
          (this.config.cols - 1) * UNIT / 2,
          0,
          0
        )
        ySeg.position = new Vector3(
          xLine.position.x - (this.config.cols - 1) * UNIT / 2 + y * UNIT / (this.config.rows - 1 || 1) * 0,
          baseY,
          (this.config.rows - 1) * UNIT / 2
        )
        const yMat = xLineMat.clone(`powerYMat_${layer}_${y}`)
        ySeg.material = yMat
        this.glowLayer && this.glowLayer.addIncludedOnlyMesh(ySeg)
      }

      const nodeKey = `power_${layer}`
      this.powerLineMeshes.set(nodeKey, { xLine, layer })
    }
  }

  _buildVerticalLift() {
    const layer = 0
    const x = this.config.cols - 1
    const y = this.config.rows - 1

    const lift = MeshBuilder.CreateBox('verticalLift', {
      width: UNIT * 1.0,
      height: this.config.layers * LAYER_HEIGHT,
      depth: UNIT * 1.0
    }, this.scene)
    lift.position = new Vector3(x * UNIT, this.config.layers * LAYER_HEIGHT / 2, y * UNIT)

    const liftMat = new StandardMaterial('liftMat', this.scene)
    liftMat.diffuseColor = new Color3(0.2, 0.6, 0.6)
    liftMat.emissiveColor = new Color3(0.05, 0.2, 0.25)
    liftMat.alpha = 0.15
    liftMat.wireframe = true
    lift.material = liftMat

    const label = this._createLabelMesh(`升降机`, 1.2, 0.3, new Color3(0, 1, 1))
    label.position = new Vector3(x * UNIT, this.config.layers * LAYER_HEIGHT + 0.5, y * UNIT)
  }

  _buildChargingStation() {
    const baseY = 0.02
    const charger = MeshBuilder.CreateCylinder('chargerPad', {
      height: 0.12,
      diameter: UNIT * 0.7,
      tessellation: 32
    }, this.scene)
    charger.position = new Vector3(0, baseY + 0.06, 0)

    const chargerMat = new PBRMaterial('chargerMat', this.scene)
    chargerMat.albedoColor = new Color3(0.2, 0.8, 0.3)
    chargerMat.emissiveColor = new Color3(0.1, 0.5, 0.15)
    chargerMat.metallic = 0.6
    chargerMat.roughness = 0.3
    charger.material = chargerMat
    this.glowLayer && this.glowLayer.addIncludedOnlyMesh(charger)

    for (let i = 0; i < 4; i++) {
      const pillar = MeshBuilder.CreateCylinder(`chargerPillar_${i}`, {
        height: 1.5,
        diameter: 0.06
      }, this.scene)
      const angle = (i / 4) * Math.PI * 2
      pillar.position = new Vector3(
        Math.cos(angle) * UNIT * 0.4,
        baseY + 0.81,
        Math.sin(angle) * UNIT * 0.4
      )
      const pMat = new StandardMaterial(`cpMat_${i}`, this.scene)
      pMat.diffuseColor = new Color3(0.5, 0.55, 0.6)
      pMat.emissiveColor = new Color3(0.05, 0.2, 0.08)
      pillar.material = pMat
    }

    const label = this._createLabelMesh('充电站', 1.2, 0.3, new Color3(0.2, 1, 0.4))
    label.position = new Vector3(0, 2.2, 0)
  }

  _createLabelMesh(text, width, height, color) {
    const texture = new DynamicTexture(`label_${text}_${Math.random()}`, {
      width: 512,
      height: 128
    }, this.scene, false)
    texture.hasAlpha = true

    const ctx = texture.getContext()
    ctx.fillStyle = 'rgba(10, 16, 30, 0.7)'
    ctx.fillRect(0, 0, 512, 128)
    ctx.strokeStyle = color.toHexString()
    ctx.lineWidth = 4
    ctx.strokeRect(2, 2, 508, 124)
    ctx.fillStyle = color.toHexString()
    ctx.font = 'bold 64px "PingFang SC", sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, 256, 64)
    texture.update()

    const plane = MeshBuilder.CreatePlane(`labelPlane_${text}`, {
      width,
      height,
      sideOrientation: Mesh.DOUBLESIDE
    }, this.scene)
    const mat = new StandardMaterial(`labelMat_${text}`, this.scene)
    mat.diffuseTexture = texture
    mat.opacityTexture = texture
    mat.emissiveColor = new Color3(1, 1, 1)
    mat.disableLighting = true
    mat.backFaceCulling = false
    plane.material = mat
    plane.billboardMode = Mesh.BILLBOARDMODE_ALL
    return plane
  }

  _setupStoreWatchers() {
    const store = this.store

    store.shuttleList.forEach(s => this._renderShuttle(s))

    this._pollInterval = setInterval(() => {
      const list = store.shuttleList
      const existing = new Set(this.shuttleMeshes.keys())
      list.forEach(s => {
        existing.delete(s.carCode)
        if (!this.shuttleMeshes.has(s.carCode)) {
          this._renderShuttle(s)
        } else {
          this._updateShuttle(s)
        }
      })
      existing.forEach(code => {
        this._removeShuttle(code)
      })
    }, 100)
  }

  _renderShuttle(shuttle) {
    if (this.shuttleMeshes.has(shuttle.carCode)) return

    const colorIdx = this.shuttleMeshes.size % this.colorPalette.length
    this.shuttleColors[shuttle.carCode] = this.colorPalette[colorIdx]

    const group = new Mesh(`shuttle_${shuttle.carCode}`, this.scene)

    const body = MeshBuilder.CreateBox(`body_${shuttle.carCode}`, {
      width: UNIT * 0.7,
      height: 0.5,
      depth: UNIT * 0.7
    }, this.scene)
    body.parent = group
    body.position.y = 0.25

    const bodyMat = new PBRMaterial(`bodyMat_${shuttle.carCode}`, this.scene)
    const hex = this.shuttleColors[shuttle.carCode]
    const color = Color3.FromHexString(hex)
    bodyMat.albedoColor = color
    bodyMat.emissiveColor = color.scale(0.4)
    bodyMat.metallic = 0.7
    bodyMat.roughness = 0.25
    body.material = bodyMat
    this.glowLayer && this.glowLayer.addIncludedOnlyMesh(body)
    this.shadowGenerator && this.shadowGenerator.addShadowCaster(body)

    const topPlate = MeshBuilder.CreateBox(`topPlate_${shuttle.carCode}`, {
      width: UNIT * 0.6,
      height: 0.08,
      depth: UNIT * 0.6
    }, this.scene)
    topPlate.parent = group
    topPlate.position.y = 0.54

    const topMat = new StandardMaterial(`topMat_${shuttle.carCode}`, this.scene)
    topMat.diffuseColor = new Color3(0.15, 0.18, 0.24)
    topMat.specularColor = new Color3(0.6, 0.65, 0.7)
    topPlate.material = topMat
    this.shadowGenerator && this.shadowGenerator.addShadowCaster(topPlate)

    for (let i = 0; i < 4; i++) {
      const wheel = MeshBuilder.CreateCylinder(`wheel_${shuttle.carCode}_${i}`, {
        height: 0.1,
        diameter: 0.18,
        tessellation: 16
      }, this.scene)
      wheel.rotation.z = Math.PI / 2
      wheel.parent = group
      const off = UNIT * 0.25
      const wx = (i % 2 === 0 ? -1 : 1) * off
      const wz = (i < 2 ? -1 : 1) * off
      wheel.position = new Vector3(wx, 0.09, wz)

      const wMat = new StandardMaterial(`wheelMat_${shuttle.carCode}_${i}`, this.scene)
      wMat.diffuseColor = new Color3(0.1, 0.1, 0.12)
      wMat.specularColor = new Color3(0.3, 0.3, 0.35)
      wheel.material = wMat
      this.shadowGenerator && this.shadowGenerator.addShadowCaster(wheel)
    }

    for (let i = 0; i < 4; i++) {
      const sensor = MeshBuilder.CreateSphere(`sensor_${shuttle.carCode}_${i}`, {
        diameter: 0.06
      }, this.scene)
      sensor.parent = group
      const sf = UNIT * 0.35
      const positions = [
        [sf, 0.25, 0], [-sf, 0.25, 0],
        [0, 0.25, sf], [0, 0.25, -sf]
      ]
      sensor.position = new Vector3(...positions[i])
      const sMat = new StandardMaterial(`sensorMat_${shuttle.carCode}_${i}`, this.scene)
      sMat.emissiveColor = new Color3(0, 1, 0.5)
      sMat.disableLighting = true
      sensor.material = sMat
      this.glowLayer && this.glowLayer.addIncludedOnlyMesh(sensor)
    }

    const antenna = MeshBuilder.CreateCylinder(`antenna_${shuttle.carCode}`, {
      height: 0.35,
      diameter: 0.02
    }, this.scene)
    antenna.parent = group
    antenna.position = new Vector3(0, 0.75, 0)
    const aMat = new StandardMaterial(`antennaMat_${shuttle.carCode}`, this.scene)
    aMat.diffuseColor = new Color3(0.6, 0.6, 0.7)
    aMat.emissiveColor = new Color3(0.2, 0.4, 0.8)
    antenna.material = aMat

    const led = MeshBuilder.CreateSphere(`led_${shuttle.carCode}`, {
      diameter: 0.05
    }, this.scene)
    led.parent = group
    led.position = new Vector3(0, 0.95, 0)
    const ledMat = new StandardMaterial(`ledMat_${shuttle.carCode}`, this.scene)
    ledMat.emissiveColor = new Color3(0, 1, 0.5)
    ledMat.disableLighting = true
    led.material = ledMat
    this.glowLayer && this.glowLayer.addIncludedOnlyMesh(led)

    const label = this._createLabelMesh(shuttle.carCode, 0.9, 0.22, color)
    label.parent = group
    label.position.y = 1.2

    const baseY = (shuttle.posLayer || 0) * LAYER_HEIGHT + 0.08
    group.position = new Vector3(
      (shuttle.posX || 0) * UNIT,
      baseY,
      (shuttle.posY || 0) * UNIT
    )

    const animGroup = new Animation(`carRotate_${shuttle.carCode}`,
      'rotation.y', 30, Animation.ANIMATIONTYPE_FLOAT, Animation.ANIMATIONLOOPMODE_CYCLE)
    const keys = [
      { frame: 0, value: 0 },
      { frame: 60, value: Math.PI * 2 }
    ]
    animGroup.setKeys(keys)
    const ease = new CubicEase()
    ease.setEasingMode(EasingFunction.EASINGMODE_EASEINOUT)
    animGroup.setEasingFunction(ease)
    led.animations = []

    group.metadata = {
      carCode: shuttle.carCode,
      currentPos: {
        x: shuttle.posX || 0,
        y: shuttle.posY || 0,
        layer: shuttle.posLayer || 0
      },
      led,
      body,
      label,
      sensorMaterials: Array.from({ length: 4 }, (_, i) =>
        this.scene.getMaterialByName(`sensorMat_${shuttle.carCode}_${i}`)
      )
    }

    group.isPickable = true
    group.getChildMeshes().forEach(m => { m.isPickable = true })

    this.scene.onPointerObservable.add((pointerInfo) => {
      if (pointerInfo.type === 1 && pointerInfo.pickInfo && pointerInfo.pickInfo.hit) {
        let picked = pointerInfo.pickInfo.pickedMesh
        while (picked && !picked.metadata?.carCode) picked = picked.parent
        if (picked && picked.metadata?.carCode) {
          const code = picked.metadata.carCode
          if (this.onShuttleClick) this.onShuttleClick(code)
        }
      }
    })

    this.shuttleMeshes.set(shuttle.carCode, group)
  }

  _updateShuttle(shuttle) {
    const group = this.shuttleMeshes.get(shuttle.carCode)
    if (!group || !group.metadata) return

    const meta = group.metadata
    const curX = meta.currentPos.x
    const curY = meta.currentPos.y
    const curLayer = meta.currentPos.layer
    const newX = shuttle.posX ?? curX
    const newY = shuttle.posY ?? curY
    const newLayer = shuttle.posLayer ?? curLayer

    if (newX !== curX || newY !== curY || newLayer !== curLayer) {
      this._animateShuttleTo(group, newX, newY, newLayer)
      meta.currentPos = { x: newX, y: newY, layer: newLayer }
    }

    const status = shuttle.status || 'IDLE'
    const ledColor = {
      IDLE: new Color3(0.2, 1, 0.4),
      MOVING: new Color3(0.2, 0.6, 1),
      LOADING: new Color3(1, 0.8, 0.2),
      UNLOADING: new Color3(1, 0.5, 0.2),
      CHARGING: new Color3(0.4, 1, 1),
      ERROR: new Color3(1, 0.2, 0.2),
      OFFLINE: new Color3(0.4, 0.4, 0.4)
    }[status] || new Color3(1, 1, 1)

    if (meta.led) {
      const ledMat = meta.led.material
      if (ledMat) ledMat.emissiveColor = ledColor
    }

    const sensorColor = shuttle.powerSupplyOk === false
      ? new Color3(1, 0.1, 0.1)
      : new Color3(0, 1, 0.5)
    meta.sensorMaterials.forEach(m => m && (m.emissiveColor = sensorColor))

    if (shuttle.direction) {
      const dirMap = {
        NORTH: 0, EAST: Math.PI / 2, SOUTH: Math.PI, WEST: -Math.PI / 2
      }
      if (dirMap[shuttle.direction] !== undefined) {
        group.rotation.y = dirMap[shuttle.direction]
      }
    }
  }

  _animateShuttleTo(group, x, y, layer) {
    const targetPos = new Vector3(
      x * UNIT,
      layer * LAYER_HEIGHT + 0.08,
      y * UNIT
    )

    const animType = Animation.ANIMATIONTYPE_VECTOR3
    const animName = `shuttleAnim_${group.name}_${Date.now()}`
    const anim = new Animation(animName, 'position', 60, animType, Animation.ANIMATIONLOOPMODE_CONSTANT)

    const startPos = group.position.clone()
    const dist = Vector3.Distance(startPos, targetPos)
    const frames = Math.max(10, Math.min(40, Math.ceil(dist * 25)))

    anim.setKeys([
      { frame: 0, value: startPos },
      { frame: frames, value: targetPos }
    ])

    const ease = new CubicEase()
    ease.setEasingMode(EasingFunction.EASINGMODE_EASEINOUT)
    anim.setEasingFunction(ease)

    this.scene.stopAnimation(group)
    this.scene.beginDirectAnimation(group, [anim], 0, frames, false, 1.0)
  }

  _removeShuttle(carCode) {
    const group = this.shuttleMeshes.get(carCode)
    if (group) {
      group.getChildMeshes().forEach(m => m.dispose())
      group.dispose()
      this.shuttleMeshes.delete(carCode)
      delete this.shuttleColors[carCode]
    }
  }

  _startRenderLoop() {
    this._boundRender = () => this.scene.render()
    this.engine.runRenderLoop(this._boundRender)

    this._resizeHandler = () => this.engine.resize()
    window.addEventListener('resize', this._resizeHandler)
  }

  focusOnShuttle(carCode) {
    const group = this.shuttleMeshes.get(carCode)
    if (!group || !this.camera) return

    const target = group.position.clone()
    const anim = new Animation('camTarget', 'target', 60, Animation.ANIMATIONTYPE_VECTOR3, 0)
    anim.setKeys([
      { frame: 0, value: this.camera.target.clone() },
      { frame: 40, value: target }
    ])
    const ease = new CubicEase()
    ease.setEasingMode(EasingFunction.EASINGMODE_EASEINOUT)
    anim.setEasingFunction(ease)
    this.scene.beginDirectAnimation(this.camera, [anim], 0, 40, false)
  }

  resetCamera() {
    if (!this.camera) return
    const centerX = (this.config.cols - 1) * UNIT / 2
    const centerZ = (this.config.rows - 1) * UNIT / 2
    const target = new Vector3(centerX, LAYER_HEIGHT * this.config.layers / 2, centerZ)
    this.camera.setTarget(target)
    this.camera.alpha = -Math.PI / 3
    this.camera.beta = Math.PI / 2.8
    this.camera.radius = Math.max(this.config.rows, this.config.cols) * 2.8
  }

  dispose() {
    this._pollInterval && clearInterval(this._pollInterval)
    window.removeEventListener('resize', this._resizeHandler)
    this.engine.stopRenderLoop()
    this.scene.dispose()
    this.engine.dispose()
    this.shuttleMeshes.clear()
    this.trackMeshes.clear()
    this.cargoMeshes.clear()
    this.rackMeshes.clear()
    this.powerLineMeshes.clear()
  }
}

export default RackSceneEngine
