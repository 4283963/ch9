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
  InstancedMesh
} from '@babylonjs/core'
import { useRackStore } from '@/store/rackStore'

const UNIT = 1.0
const TRACK_WIDTH = 0.15
const LAYER_HEIGHT = 4.5
const SHELF_HEIGHT = 3.5

const MAX_SHUTTLES = 16
const LABEL_ATLAS_WIDTH = 1024
const LABEL_ATLAS_HEIGHT = 256
const LABEL_CELL_WIDTH = 128
const LABEL_CELL_HEIGHT = 64
const LABELS_PER_ROW = Math.floor(LABEL_ATLAS_WIDTH / LABEL_CELL_WIDTH)

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

    this._sharedMaterials = new Map()
    this._labelAtlas = null
    this._labelAtlasMat = null
    this._labelCells = new Map()
    this._nextLabelCell = 0
    this._pointerObserver = null

    this._instancedMeshes = []
    this._allMaterials = new Set()
    this._allTextures = new Set()
    this._faultHighlights = new Map()
    this._faultAnimations = new Map()
    this._unwatchTrackFaults = null
  }

  async init() {
    this.store = useRackStore()
    this.engine = new Engine(this.canvas, false, {
      preserveDrawingBuffer: false,
      stencil: false,
      antialias: false,
      powerPreference: 'high-performance'
    })
    this.scene = new Scene(this.engine)
    this.scene.clearColor = new Color4(0.03, 0.05, 0.10, 1.0)
    this.scene.autoClear = true
    this.scene.blockMaterialDirtyMechanism = true

    this._setupCamera()
    this._setupLights()
    this._setupPostProcess()
    this._buildFloorGrid()
    this._createSharedMaterials()
    this._createLabelAtlas()

    this.config = {
      rows: this.store.rackConfig.rows,
      cols: this.store.rackConfig.cols,
      layers: this.store.rackConfig.layers
    }

    this._buildRackSystem()
    this._setupGlobalPointerHandler()
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

    this.shadowGenerator = new ShadowGenerator(1024, sun)
    this.shadowGenerator.useBlurExponentialShadowMap = true
    this.shadowGenerator.blurKernel = 8
    this.shadowGenerator.bias = 0.0005
  }

  _setupPostProcess() {
    this.pipeline = new DefaultRenderingPipeline('pipeline', true, this.scene, [this.camera])
    this.pipeline.samples = 2
    this.pipeline.fxaaEnabled = true
    this.pipeline.fxaa.samples = 2

    this.pipeline.bloomEnabled = true
    this.pipeline.bloomThreshold = 0.85
    this.pipeline.bloomWeight = 0.25
    this.pipeline.bloomKernel = 16
    this.pipeline.bloomScale = 0.25

    this.glowLayer = new GlowLayer('glow', this.scene, {
      mainTextureFixedSize: 256,
      blurKernelSize: 8
    })
  }

  _createSharedMaterials() {
    for (let layer = 0; layer < this.config.layers; layer++) {
      const baseY = layer * LAYER_HEIGHT

      const trackPlateMat = new StandardMaterial(`trackPlateMat_layer${layer}`, this.scene)
      trackPlateMat.diffuseColor = new Color3(0.25, 0.3, 0.38)
      trackPlateMat.specularColor = new Color3(0.1, 0.1, 0.15)
      trackPlateMat.emissiveColor = new Color3(0.02, 0.04, 0.08)
      this._sharedMaterials.set(`trackPlate_layer${layer}`, trackPlateMat)
      this._allMaterials.add(trackPlateMat)

      const railMat = new StandardMaterial(`railMat_layer${layer}`, this.scene)
      railMat.diffuseColor = new Color3(0.55, 0.6, 0.68)
      railMat.specularColor = new Color3(0.8, 0.85, 0.9)
      railMat.specularPower = 64
      railMat.emissiveColor = new Color3(0.05, 0.08, 0.12)
      this._sharedMaterials.set(`rail_layer${layer}`, railMat)
      this._allMaterials.add(railMat)

      const pillarMat = new StandardMaterial(`pillarMat_layer${layer}`, this.scene)
      pillarMat.diffuseColor = new Color3(0.45, 0.48, 0.55)
      pillarMat.specularColor = new Color3(0.2, 0.2, 0.25)
      this._sharedMaterials.set(`pillar_layer${layer}`, pillarMat)
      this._allMaterials.add(pillarMat)

      const beamMat = new StandardMaterial(`beamMat_layer${layer}`, this.scene)
      beamMat.diffuseColor = new Color3(0.55, 0.4, 0.3)
      beamMat.specularColor = new Color3(0.1, 0.08, 0.05)
      this._sharedMaterials.set(`beam_layer${layer}`, beamMat)
      this._allMaterials.add(beamMat)

      const gridMat = new StandardMaterial(`gridMat_layer${layer}`, this.scene)
      gridMat.emissiveColor = new Color3(0.08, 0.14, 0.25)
      gridMat.alpha = layer === 0 ? 0.8 : 0.35
      gridMat.disableLighting = true
      gridMat.wireframe = true
      this._sharedMaterials.set(`grid_layer${layer}`, gridMat)
      this._allMaterials.add(gridMat)
    }

    const groundMat = new StandardMaterial('groundMat', this.scene)
    groundMat.emissiveColor = new Color3(0.04, 0.06, 0.1)
    groundMat.disableLighting = true
    this._sharedMaterials.set('ground', groundMat)
    this._allMaterials.add(groundMat)

    const wheelMat = new StandardMaterial('wheelMat_shared', this.scene)
    wheelMat.diffuseColor = new Color3(0.1, 0.1, 0.12)
    wheelMat.specularColor = new Color3(0.3, 0.3, 0.35)
    this._sharedMaterials.set('wheel', wheelMat)
    this._allMaterials.add(wheelMat)

    const topMat = new StandardMaterial('topMat_shared', this.scene)
    topMat.diffuseColor = new Color3(0.15, 0.18, 0.24)
    topMat.specularColor = new Color3(0.6, 0.65, 0.7)
    this._sharedMaterials.set('topPlate', topMat)
    this._allMaterials.add(topMat)

    const antennaMat = new StandardMaterial('antennaMat_shared', this.scene)
    antennaMat.diffuseColor = new Color3(0.6, 0.6, 0.7)
    antennaMat.emissiveColor = new Color3(0.2, 0.4, 0.8)
    this._sharedMaterials.set('antenna', antennaMat)
    this._allMaterials.add(antennaMat)

    const liftMat = new StandardMaterial('liftMat', this.scene)
    liftMat.diffuseColor = new Color3(0.2, 0.6, 0.6)
    liftMat.emissiveColor = new Color3(0.05, 0.2, 0.25)
    liftMat.alpha = 0.15
    liftMat.wireframe = true
    this._sharedMaterials.set('lift', liftMat)
    this._allMaterials.add(liftMat)

    const chargerPillarMat = new StandardMaterial('chargerPillarMat', this.scene)
    chargerPillarMat.diffuseColor = new Color3(0.5, 0.55, 0.6)
    chargerPillarMat.emissiveColor = new Color3(0.05, 0.2, 0.08)
    this._sharedMaterials.set('chargerPillar', chargerPillarMat)
    this._allMaterials.add(chargerPillarMat)

    const bandMat = new StandardMaterial('cargoBandMat', this.scene)
    bandMat.diffuseColor = new Color3(0.15, 0.15, 0.2)
    bandMat.emissiveColor = new Color3(0.3, 0.05, 0.05)
    this._sharedMaterials.set('cargoBand', bandMat)
    this._allMaterials.add(bandMat)

    const faultBaseMat = new StandardMaterial('faultHighlightBase', this.scene)
    faultBaseMat.diffuseColor = new Color3(1, 0.5, 0)
    faultBaseMat.emissiveColor = new Color3(1, 0.4, 0)
    faultBaseMat.alpha = 0.85
    faultBaseMat.disableLighting = true
    this._sharedMaterials.set('faultHighlight', faultBaseMat)
    this._allMaterials.add(faultBaseMat)
  }

  _createLabelAtlas() {
    this._labelAtlas = new DynamicTexture('labelAtlas', {
      width: LABEL_ATLAS_WIDTH,
      height: LABEL_ATLAS_HEIGHT
    }, this.scene, false)
    this._labelAtlas.hasAlpha = true
    this._allTextures.add(this._labelAtlas)

    const ctx = this._labelAtlas.getContext()
    ctx.fillStyle = 'rgba(0, 0, 0, 0)'
    ctx.fillRect(0, 0, LABEL_ATLAS_WIDTH, LABEL_ATLAS_HEIGHT)
    this._labelAtlas.update()

    this._labelAtlasMat = new StandardMaterial('labelAtlasMat', this.scene)
    this._labelAtlasMat.diffuseTexture = this._labelAtlas
    this._labelAtlasMat.opacityTexture = this._labelAtlas
    this._labelAtlasMat.emissiveColor = new Color3(1, 1, 1)
    this._labelAtlasMat.disableLighting = true
    this._labelAtlasMat.backFaceCulling = false
    this._allMaterials.add(this._labelAtlasMat)
  }

  _allocateLabelCell(text, color) {
    if (this._labelCells.has(text)) {
      return this._labelCells.get(text)
    }

    const cellIdx = this._nextLabelCell
    if (cellIdx >= MAX_SHUTTLES) {
      console.warn('Label atlas full, reusing cell 0')
      return { uOffset: 0, vOffset: 0 }
    }

    const col = cellIdx % LABELS_PER_ROW
    const row = Math.floor(cellIdx / LABELS_PER_ROW)
    const uOffset = col * LABEL_CELL_WIDTH / LABEL_ATLAS_WIDTH
    const vOffset = row * LABEL_CELL_HEIGHT / LABEL_ATLAS_HEIGHT

    const ctx = this._labelAtlas.getContext()
    const x = col * LABEL_CELL_WIDTH
    const y = row * LABEL_CELL_HEIGHT

    ctx.fillStyle = 'rgba(10, 16, 30, 0.75)'
    ctx.fillRect(x, y, LABEL_CELL_WIDTH, LABEL_CELL_HEIGHT)

    ctx.strokeStyle = color.toHexString()
    ctx.lineWidth = 2
    ctx.strokeRect(x + 1, y + 1, LABEL_CELL_WIDTH - 2, LABEL_CELL_HEIGHT - 2)

    ctx.fillStyle = color.toHexString()
    ctx.font = 'bold 28px "PingFang SC", sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, x + LABEL_CELL_WIDTH / 2, y + LABEL_CELL_HEIGHT / 2)

    this._labelAtlas.update()

    this._nextLabelCell++
    const result = { uOffset, vOffset, cellIdx }
    this._labelCells.set(text, result)
    return result
  }

  _buildFloorGrid() {
    const totalWidth = this.config.cols * UNIT + 4
    const totalDepth = this.config.rows * UNIT + 4
    const ground = MeshBuilder.CreateGround('ground', {
      width: totalWidth,
      height: totalDepth,
      subdivisions: 20
    }, this.scene)
    ground.position = new Vector3(
      (this.config.cols - 1) * UNIT / 2,
      -0.01,
      (this.config.rows - 1) * UNIT / 2
    )
    ground.material = this._sharedMaterials.get('ground')
    ground.receiveShadows = true

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

      const layerIdx = Math.min(i, this.config.layers - 1)
      grid.material = this._sharedMaterials.get(`grid_layer${layerIdx}`)
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
    const off = UNIT * 0.4

    const trackPlateMat = this._sharedMaterials.get(`trackPlate_layer${layer}`)
    const railMat = this._sharedMaterials.get(`rail_layer${layer}`)
    const pillarMat = this._sharedMaterials.get(`pillar_layer${layer}`)
    const beamMat = this._sharedMaterials.get(`beam_layer${layer}`)

    const trackPlateTemplate = MeshBuilder.CreateBox(`trackPlateTemplate_layer${layer}`, {
      width: UNIT * 0.95,
      height: 0.06,
      depth: UNIT * 0.95
    }, this.scene)
    trackPlateTemplate.material = trackPlateMat
    trackPlateTemplate.receiveShadows = true
    trackPlateTemplate.setEnabled(false)

    const xRailTemplate = MeshBuilder.CreateBox(`xRailTemplate_layer${layer}`, {
      width: UNIT * 0.9,
      height: 0.04,
      depth: TRACK_WIDTH
    }, this.scene)
    xRailTemplate.material = railMat
    xRailTemplate.receiveShadows = true
    xRailTemplate.setEnabled(false)

    const yRailTemplate = MeshBuilder.CreateBox(`yRailTemplate_layer${layer}`, {
      width: TRACK_WIDTH,
      height: 0.04,
      depth: UNIT * 0.9
    }, this.scene)
    yRailTemplate.material = railMat
    yRailTemplate.receiveShadows = true
    yRailTemplate.setEnabled(false)

    const pillarTemplate = MeshBuilder.CreateBox(`pillarTemplate_layer${layer}`, {
      width: 0.08,
      height: SHELF_HEIGHT,
      depth: 0.08
    }, this.scene)
    pillarTemplate.material = pillarMat
    pillarTemplate.receiveShadows = true
    if (this.shadowGenerator) this.shadowGenerator.addShadowCaster(pillarTemplate)
    pillarTemplate.setEnabled(false)

    const beamHTemplate = MeshBuilder.CreateBox(`beamHTemplate_layer${layer}`, {
      width: UNIT * 0.85, height: 0.06, depth: 0.06
    }, this.scene)
    beamHTemplate.material = beamMat
    beamHTemplate.receiveShadows = true
    if (this.shadowGenerator) this.shadowGenerator.addShadowCaster(beamHTemplate)
    beamHTemplate.setEnabled(false)

    const beamVTemplate = MeshBuilder.CreateBox(`beamVTemplate_layer${layer}`, {
      width: 0.06, height: 0.06, depth: UNIT * 0.85
    }, this.scene)
    beamVTemplate.material = beamMat
    beamVTemplate.receiveShadows = true
    if (this.shadowGenerator) this.shadowGenerator.addShadowCaster(beamVTemplate)
    beamVTemplate.setEnabled(false)

    const layerMeshes = []
    for (let y = 0; y < this.config.rows; y++) {
      for (let x = 0; x < this.config.cols; x++) {
        const px = x * UNIT
        const py = baseY + 0.02
        const pz = y * UNIT

        const tp = trackPlateTemplate.createInstance(`tp_${layer}_${y}_${x}`)
        tp.position.set(px, py, pz)
        layerMeshes.push(tp)

        const xr = xRailTemplate.createInstance(`xr_${layer}_${y}_${x}`)
        xr.position.set(px, py + 0.04, pz - UNIT * 0.2)
        layerMeshes.push(xr)

        const yr = yRailTemplate.createInstance(`yr_${layer}_${y}_${x}`)
        yr.position.set(px - UNIT * 0.2, py + 0.04, pz)
        layerMeshes.push(yr)

        const pillarBaseY = baseY + 0.05 + SHELF_HEIGHT / 2
        const p1 = pillarTemplate.createInstance(`p1_${layer}_${y}_${x}`)
        p1.position.set(px - off, pillarBaseY, pz - off)
        const p2 = pillarTemplate.createInstance(`p2_${layer}_${y}_${x}`)
        p2.position.set(px + off, pillarBaseY, pz - off)
        const p3 = pillarTemplate.createInstance(`p3_${layer}_${y}_${x}`)
        p3.position.set(px - off, pillarBaseY, pz + off)
        const p4 = pillarTemplate.createInstance(`p4_${layer}_${y}_${x}`)
        p4.position.set(px + off, pillarBaseY, pz + off)
        layerMeshes.push(p1, p2, p3, p4)

        const beamY = baseY + 0.05 + SHELF_HEIGHT
        const bh1 = beamHTemplate.createInstance(`bh1_${layer}_${y}_${x}`)
        bh1.position.set(px, beamY, pz - off)
        const bh2 = beamHTemplate.createInstance(`bh2_${layer}_${y}_${x}`)
        bh2.position.set(px, beamY, pz + off)
        const bv1 = beamVTemplate.createInstance(`bv1_${layer}_${y}_${x}`)
        bv1.position.set(px - off, beamY, pz)
        const bv2 = beamVTemplate.createInstance(`bv2_${layer}_${y}_${x}`)
        bv2.position.set(px + off, beamY, pz)
        layerMeshes.push(bh1, bh2, bv1, bv2)

        const key = `${layer}-${y}-${x}`
        this.trackMeshes.set(key, { x, y, layer, position: new Vector3(px, py, pz) })

        if (Math.random() < 0.15 && !(x === 0 && y === 0)) {
          this._buildCargoBox(x, y, layer, baseY, `cargo_${key}`)
        }
      }
    }

    this._instancedMeshes.push(...layerMeshes)
  }

  _buildCargoBox(x, y, layer, baseY, cargoKey) {
    const hue = Math.floor(Math.random() * 360)
    const color = Color3.FromHSV(hue, 0.35, 0.9)
    const emissive = Color3.FromHSV(hue, 0.15, 0.2)

    const mat = new StandardMaterial(`${cargoKey}_mat`, this.scene)
    mat.diffuseColor = color
    mat.emissiveColor = emissive
    mat.specularColor = new Color3(0.1, 0.1, 0.1)
    this._allMaterials.add(mat)

    const cargo = MeshBuilder.CreateBox(cargoKey, {
      width: UNIT * 0.55,
      height: UNIT * 0.5,
      depth: UNIT * 0.55
    }, this.scene)
    cargo.position = new Vector3(x * UNIT, baseY + 0.08 + UNIT * 0.25, y * UNIT)
    cargo.material = mat
    if (this.shadowGenerator) this.shadowGenerator.addShadowCaster(cargo)
    cargo.receiveShadows = true

    const band = MeshBuilder.CreateBox(`band_${cargoKey}`, {
      width: UNIT * 0.57,
      height: 0.04,
      depth: UNIT * 0.57
    }, this.scene)
    band.parent = cargo
    band.material = this._sharedMaterials.get('cargoBand')

    this.cargoMeshes.set(cargoKey, cargo)
  }

  _buildPowerLines() {
    const powerXLineMat = new PBRMaterial('powerXLineMat', this.scene)
    powerXLineMat.albedoColor = new Color3(0.8, 0.7, 0.2)
    powerXLineMat.emissiveColor = new Color3(0.3, 0.25, 0.05)
    powerXLineMat.metallic = 0.8
    powerXLineMat.roughness = 0.3
    this._allMaterials.add(powerXLineMat)

    for (let layer = 0; layer < this.config.layers; layer++) {
      const baseY = layer * LAYER_HEIGHT + SHELF_HEIGHT + 0.3

      const xLine = MeshBuilder.CreateCylinder(`powerX_${layer}`, {
        height: this.config.cols * UNIT,
        diameter: 0.06,
        tessellation: 6
      }, this.scene)
      xLine.rotation.z = Math.PI / 2
      xLine.position = new Vector3(
        (this.config.cols - 1) * UNIT / 2,
        baseY,
        0
      )
      xLine.material = powerXLineMat
      if (this.glowLayer) this.glowLayer.addIncludedOnlyMesh(xLine)

      const yLineTemplate = MeshBuilder.CreateCylinder(`yLineTemplate_${layer}`, {
        height: (this.config.rows - 1) * UNIT,
        diameter: 0.05,
        tessellation: 6
      }, this.scene)
      yLineTemplate.setEnabled(false)

      const yLineIM = new InstancedMesh(`yLineIM_${layer}`, yLineTemplate, this.config.rows, this.scene)
      yLineIM.material = powerXLineMat
      this._instancedMeshes.push(yLineIM)

      const tmpMat = new Matrix()
      for (let y = 0; y < this.config.rows; y++) {
        const px = y * UNIT
        Matrix.TranslationToRef(px, baseY, (this.config.rows - 1) * UNIT / 2, tmpMat)
        yLineIM.setMatrixAtIndex(y, tmpMat)
        if (this.glowLayer) this.glowLayer.addIncludedOnlyMesh(yLineIM)
      }

      yLineIM.refreshBoundingInfo()
      yLineTemplate.dispose()

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
    lift.material = this._sharedMaterials.get('lift')

    const color = new Color3(0, 1, 1)
    const cell = this._allocateLabelCell('升降机', color)
    const label = this._createAtlasLabel(cell, 1.2, 0.3)
    label.position = new Vector3(x * UNIT, this.config.layers * LAYER_HEIGHT + 0.5, y * UNIT)
  }

  _buildChargingStation() {
    const baseY = 0.02
    const charger = MeshBuilder.CreateCylinder('chargerPad', {
      height: 0.12,
      diameter: UNIT * 0.7,
      tessellation: 24
    }, this.scene)
    charger.position = new Vector3(0, baseY + 0.06, 0)

    const chargerMat = new PBRMaterial('chargerMat', this.scene)
    chargerMat.albedoColor = new Color3(0.2, 0.8, 0.3)
    chargerMat.emissiveColor = new Color3(0.1, 0.5, 0.15)
    chargerMat.metallic = 0.6
    chargerMat.roughness = 0.3
    charger.material = chargerMat
    this._allMaterials.add(chargerMat)
    if (this.glowLayer) this.glowLayer.addIncludedOnlyMesh(charger)

    const pillarTemplate = MeshBuilder.CreateCylinder('chargerPillarTemplate', {
      height: 1.5,
      diameter: 0.06,
      tessellation: 8
    }, this.scene)
    pillarTemplate.setEnabled(false)

    const pillarIM = new InstancedMesh('chargerPillarIM', pillarTemplate, 4, this.scene)
    pillarIM.material = this._sharedMaterials.get('chargerPillar')
    this._instancedMeshes.push(pillarIM)

    const tmpMat = new Matrix()
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2
      Matrix.TranslationToRef(
        Math.cos(angle) * UNIT * 0.4,
        baseY + 0.81,
        Math.sin(angle) * UNIT * 0.4,
        tmpMat
      )
      pillarIM.setMatrixAtIndex(i, tmpMat)
    }
    pillarIM.refreshBoundingInfo()
    pillarTemplate.dispose()

    const color = new Color3(0.2, 1, 0.4)
    const cell = this._allocateLabelCell('充电站', color)
    const label = this._createAtlasLabel(cell, 1.2, 0.3)
    label.position = new Vector3(0, 2.2, 0)
  }

  _createAtlasLabel(cellInfo, width, height) {
    const plane = MeshBuilder.CreatePlane(`labelPlane_${cellInfo.cellIdx}`, {
      width,
      height,
      sideOrientation: Mesh.DOUBLESIDE
    }, this.scene)

    const mat = this._labelAtlasMat.clone(`labelMat_${cellInfo.cellIdx}`)
    this._allMaterials.add(mat)
    mat.diffuseTexture = this._labelAtlas
    mat.opacityTexture = this._labelAtlas
    mat.diffuseTexture.uScale = LABEL_CELL_WIDTH / LABEL_ATLAS_WIDTH
    mat.diffuseTexture.vScale = LABEL_CELL_HEIGHT / LABEL_ATLAS_HEIGHT
    mat.diffuseTexture.uOffset = cellInfo.uOffset
    mat.diffuseTexture.vOffset = cellInfo.vOffset
    mat.opacityTexture.uScale = LABEL_CELL_WIDTH / LABEL_ATLAS_WIDTH
    mat.opacityTexture.vScale = LABEL_CELL_HEIGHT / LABEL_ATLAS_HEIGHT
    mat.opacityTexture.uOffset = cellInfo.uOffset
    mat.opacityTexture.vOffset = cellInfo.vOffset

    plane.material = mat
    plane.billboardMode = Mesh.BILLBOARDMODE_ALL
    return plane
  }

  _setupGlobalPointerHandler() {
    this._pointerObserver = this.scene.onPointerObservable.add((pointerInfo) => {
      if (pointerInfo.type === 1 && pointerInfo.pickInfo && pointerInfo.pickInfo.hit) {
        let picked = pointerInfo.pickInfo.pickedMesh
        while (picked && !picked.metadata?.carCode) picked = picked.parent
        if (picked && picked.metadata?.carCode) {
          const code = picked.metadata.carCode
          if (this.onShuttleClick) this.onShuttleClick(code)
        }
      }
    })
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

    this._faultCheckInterval = setInterval(() => {
      this._updateTrackFaultHighlights()
    }, 200)
  }

  _updateTrackFaultHighlights() {
    if (!this.store) return
    const faults = this.store.trackFaultList
    const existingKeys = new Set(this._faultHighlights.keys())

    faults.forEach(fault => {
      const key = fault.faultKey
      existingKeys.delete(key)
      if (!this._faultHighlights.has(key)) {
        this._createFaultHighlight(fault)
      }
    })

    existingKeys.forEach(key => {
      this._removeFaultHighlight(key)
    })
  }

  _createFaultHighlight(fault) {
    const key = fault.faultKey
    if (this._faultHighlights.has(key)) return

    const baseY = fault.trackLayer * LAYER_HEIGHT + 0.03

    const group = new Mesh(`faultHighlight_${key}`, this.scene)
    group.position = new Vector3(
      fault.trackX * UNIT,
      baseY,
      fault.trackY * UNIT
    )

    const highlightPlate = MeshBuilder.CreateBox(`faultPlate_${key}`, {
      width: UNIT * 0.98,
      height: 0.02,
      depth: UNIT * 0.98
    }, this.scene)
    highlightPlate.parent = group

    const mat = this._sharedMaterials.get('faultHighlight').clone(`faultMat_${key}`)
    this._allMaterials.add(mat)
    highlightPlate.material = mat
    if (this.glowLayer) {
      this.glowLayer.addIncludedOnlyMesh(highlightPlate)
    }

    const bars = []
    for (let i = 0; i < 3; i++) {
      const bar = MeshBuilder.CreateBox(`faultBar_${key}_${i}`, {
        width: UNIT * 0.9,
        height: 0.015,
        depth: 0.08
      }, this.scene)
      bar.parent = group
      bar.position = new Vector3(
        (i - 1) * UNIT * 0.25,
        0.015,
        0
      )
      const barMat = new StandardMaterial(`faultBarMat_${key}_${i}`, this.scene)
      barMat.emissiveColor = new Color3(1, 0.3, 0)
      barMat.disableLighting = true
      bar.material = barMat
      this._allMaterials.add(barMat)
      bars.push({ mesh: bar, mat: barMat })
      if (this.glowLayer) {
        this.glowLayer.addIncludedOnlyMesh(bar)
      }
    }

    const xRail = MeshBuilder.CreateBox(`faultRailX_${key}`, {
      width: UNIT * 0.95,
      height: 0.02,
      depth: TRACK_WIDTH * 1.5
    }, this.scene)
    xRail.parent = group
    xRail.position = new Vector3(0, 0.01, -UNIT * 0.2)
    const xRailMat = new StandardMaterial(`faultRailXMat_${key}`, this.scene)
    xRailMat.emissiveColor = new Color3(1, 0.6, 0.2)
    xRailMat.disableLighting = true
    xRail.material = xRailMat
    this._allMaterials.add(xRailMat)
    if (this.glowLayer) {
      this.glowLayer.addIncludedOnlyMesh(xRail)
    }

    const yRail = MeshBuilder.CreateBox(`faultRailY_${key}`, {
      width: TRACK_WIDTH * 1.5,
      height: 0.02,
      depth: UNIT * 0.95
    }, this.scene)
    yRail.parent = group
    yRail.position = new Vector3(-UNIT * 0.2, 0.01, 0)
    yRail.material = xRailMat

    const pulseAnim = new Animation(
      `faultPulse_${key}`,
      'material.emissiveColor',
      8,
      Animation.ANIMATIONTYPE_COLOR3,
      Animation.ANIMATIONLOOPMODE_CYCLE
    )

    const colorKeys = [
      { frame: 0, value: new Color3(1, 0.6, 0.1) },
      { frame: 10, value: new Color3(1, 0.2, 0) },
      { frame: 20, value: new Color3(1, 0.7, 0.2) },
      { frame: 30, value: new Color3(1, 0.3, 0.05) },
      { frame: 40, value: new Color3(1, 0.6, 0.1) }
    ]
    pulseAnim.setKeys(colorKeys)

    const ease = new CubicEase()
    ease.setEasingMode(EasingFunction.EASINGMODE_EASEINOUT)
    pulseAnim.setEasingFunction(ease)

    const alphaAnim = new Animation(
      `faultAlpha_${key}`,
      'material.alpha',
      8,
      Animation.ANIMATIONTYPE_FLOAT,
      Animation.ANIMATIONLOOPMODE_CYCLE
    )
    alphaAnim.setKeys([
      { frame: 0, value: 0.9 },
      { frame: 20, value: 0.5 },
      { frame: 40, value: 0.9 }
    ])
    alphaAnim.setEasingFunction(ease)

    highlightPlate.animations = [pulseAnim, alphaAnim]
    this.scene.beginAnimation(highlightPlate, 0, 40, true, 1.0)

    bars.forEach((bar, idx) => {
      const barPulse = pulseAnim.clone(`barPulse_${key}_${idx}`)
      barPulse.setKeys([
        { frame: 0, value: new Color3(1, 0.7, 0.3) },
        { frame: 10, value: new Color3(0.8, 0.1, 0) },
        { frame: 20, value: new Color3(1, 0.5, 0.1) },
        { frame: 30, value: new Color3(0.9, 0.2, 0.05) },
        { frame: 40, value: new Color3(1, 0.7, 0.3) }
      ])
      bar.mesh.animations = [barPulse]
      this.scene.beginAnimation(bar.mesh, 0, 40, true, 1.0 + idx * 0.2)
    })

    this._faultAnimations.set(key, {
      plateAnim: pulseAnim,
      alphaAnim,
      barAnims: bars.map(b => b.mesh.animations[0])
    })

    group.metadata = {
      faultKey: key,
      plate: highlightPlate,
      bars,
      xRail,
      yRail,
      mat,
      barMats: bars.map(b => b.mat),
      xRailMat
    }

    this._faultHighlights.set(key, group)

    console.log(`[3D] 故障轨道高亮已创建: (${fault.trackX},${fault.trackY},${fault.trackLayer})`)
  }

  _removeFaultHighlight(key) {
    const group = this._faultHighlights.get(key)
    if (!group) return

    this.scene.stopAnimation(group)
    group.getChildMeshes().forEach(m => {
      this.scene.stopAnimation(m)
      if (m.geometry) m.geometry.dispose()
      m.dispose()
    })

    if (group.metadata) {
      const meta = group.metadata
      if (meta.mat) {
        this._allMaterials.delete(meta.mat)
        meta.mat.dispose()
      }
      if (meta.barMats) {
        meta.barMats.forEach(m => {
          this._allMaterials.delete(m)
          m.dispose()
        })
      }
      if (meta.xRailMat) {
        this._allMaterials.delete(meta.xRailMat)
        meta.xRailMat.dispose()
      }
    }

    if (group.geometry) group.geometry.dispose()
    group.dispose()

    this._faultHighlights.delete(key)
    this._faultAnimations.delete(key)

    console.log(`[3D] 故障轨道高亮已移除: ${key}`)
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
    bodyMat.emissiveColor = color.scale(0.3)
    bodyMat.metallic = 0.7
    bodyMat.roughness = 0.25
    body.material = bodyMat
    this._allMaterials.add(bodyMat)
    if (this.glowLayer) this.glowLayer.addIncludedOnlyMesh(body)
    if (this.shadowGenerator) this.shadowGenerator.addShadowCaster(body)

    const topPlate = MeshBuilder.CreateBox(`topPlate_${shuttle.carCode}`, {
      width: UNIT * 0.6,
      height: 0.08,
      depth: UNIT * 0.6
    }, this.scene)
    topPlate.parent = group
    topPlate.position.y = 0.54
    topPlate.material = this._sharedMaterials.get('topPlate')
    if (this.shadowGenerator) this.shadowGenerator.addShadowCaster(topPlate)

    for (let i = 0; i < 4; i++) {
      const wheel = MeshBuilder.CreateCylinder(`wheel_${shuttle.carCode}_${i}`, {
        height: 0.1,
        diameter: 0.18,
        tessellation: 10
      }, this.scene)
      wheel.rotation.z = Math.PI / 2
      wheel.parent = group
      const off = UNIT * 0.25
      const wx = (i % 2 === 0 ? -1 : 1) * off
      const wz = (i < 2 ? -1 : 1) * off
      wheel.position = new Vector3(wx, 0.09, wz)
      wheel.material = this._sharedMaterials.get('wheel')
      if (this.shadowGenerator) this.shadowGenerator.addShadowCaster(wheel)
    }

    const sensorColor = new Color3(0, 1, 0.5)
    for (let i = 0; i < 4; i++) {
      const sensor = MeshBuilder.CreateSphere(`sensor_${shuttle.carCode}_${i}`, {
        diameter: 0.06,
        segments: 8
      }, this.scene)
      sensor.parent = group
      const sf = UNIT * 0.35
      const positions = [
        [sf, 0.25, 0], [-sf, 0.25, 0],
        [0, 0.25, sf], [0, 0.25, -sf]
      ]
      sensor.position = new Vector3(...positions[i])
      const sMat = new StandardMaterial(`sensorMat_${shuttle.carCode}_${i}`, this.scene)
      sMat.emissiveColor = sensorColor
      sMat.disableLighting = true
      sensor.material = sMat
      this._allMaterials.add(sMat)
      if (this.glowLayer) this.glowLayer.addIncludedOnlyMesh(sensor)
    }

    const antenna = MeshBuilder.CreateCylinder(`antenna_${shuttle.carCode}`, {
      height: 0.35,
      diameter: 0.02,
      tessellation: 6
    }, this.scene)
    antenna.parent = group
    antenna.position = new Vector3(0, 0.75, 0)
    antenna.material = this._sharedMaterials.get('antenna')

    const led = MeshBuilder.CreateSphere(`led_${shuttle.carCode}`, {
      diameter: 0.05,
      segments: 8
    }, this.scene)
    led.parent = group
    led.position = new Vector3(0, 0.95, 0)
    const ledMat = new StandardMaterial(`ledMat_${shuttle.carCode}`, this.scene)
    ledMat.emissiveColor = new Color3(0, 1, 0.5)
    ledMat.disableLighting = true
    led.material = ledMat
    this._allMaterials.add(ledMat)
    if (this.glowLayer) this.glowLayer.addIncludedOnlyMesh(led)

    const cell = this._allocateLabelMesh(shuttle.carCode, color)
    const label = this._createAtlasLabel(cell, 0.9, 0.22)
    label.parent = group
    label.position.y = 1.2

    const baseY = (shuttle.posLayer || 0) * LAYER_HEIGHT + 0.08
    group.position = new Vector3(
      (shuttle.posX || 0) * UNIT,
      baseY,
      (shuttle.posY || 0) * UNIT
    )

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
      ),
      ledMaterial: ledMat,
      bodyMaterial: bodyMat,
      labelMaterial: label.material
    }

    group.isPickable = true
    group.getChildMeshes().forEach(m => { m.isPickable = true })

    this.shuttleMeshes.set(shuttle.carCode, group)
  }

  _allocateLabelMesh(text, color) {
    return this._allocateLabelCell(text, color)
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

    if (meta.ledMaterial) {
      meta.ledMaterial.emissiveColor = ledColor
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

    const startPos = group.position.clone()
    const dist = Vector3.Distance(startPos, targetPos)
    const frames = Math.max(10, Math.min(40, Math.ceil(dist * 25)))

    let anim = this.animatingShuttles.get(group.name)
    if (!anim) {
      anim = new Animation(
        `shuttleAnim_${group.name}`,
        'position',
        60,
        Animation.ANIMATIONTYPE_VECTOR3,
        Animation.ANIMATIONLOOPMODE_CONSTANT
      )
      const ease = new CubicEase()
      ease.setEasingMode(EasingFunction.EASINGMODE_EASEINOUT)
      anim.setEasingFunction(ease)
      this.animatingShuttles.set(group.name, anim)
    }

    anim.setKeys([
      { frame: 0, value: startPos },
      { frame: frames, value: targetPos }
    ])

    this.scene.stopAnimation(group)
    this.scene.beginDirectAnimation(group, [anim], 0, frames, false, 1.0)
  }

  _removeShuttle(carCode) {
    const group = this.shuttleMeshes.get(carCode)
    if (group) {
      this.scene.stopAnimation(group)

      if (group.metadata) {
        if (group.metadata.bodyMaterial) {
          this._allMaterials.delete(group.metadata.bodyMaterial)
          group.metadata.bodyMaterial.dispose()
        }
        if (group.metadata.ledMaterial) {
          this._allMaterials.delete(group.metadata.ledMaterial)
          group.metadata.ledMaterial.dispose()
        }
        if (group.metadata.labelMaterial) {
          this._allMaterials.delete(group.metadata.labelMaterial)
          group.metadata.labelMaterial.dispose()
        }
        if (group.metadata.sensorMaterials) {
          group.metadata.sensorMaterials.forEach(m => {
            if (m) {
              this._allMaterials.delete(m)
              m.dispose()
            }
          })
        }
      }

      group.getChildMeshes().forEach(m => {
        if (m.geometry) m.geometry.dispose()
        m.dispose()
      })
      if (group.geometry) group.geometry.dispose()
      group.dispose()

      this.shuttleMeshes.delete(carCode)
      delete this.shuttleColors[carCode]
      this.animatingShuttles.delete(group.name)
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

  getTrackWorldPosition(x, y, layer) {
    const { TRACK_UNIT, LAYER_HEIGHT } = this
    return new Vector3(
      (x - this.config.cols / 2 + 0.5) * TRACK_UNIT,
      layer * LAYER_HEIGHT + 0.1,
      (y - this.config.rows / 2 + 0.5) * TRACK_UNIT
    )
  }

  focusOnPosition(pos) {
    if (!this.camera || !pos) return

    const ease = new CubicEase()
    ease.setEasingMode(EasingFunction.EASINGMODE_EASEINOUT)

    const targetAnim = new Animation('camTarget', 'target', 60, Animation.ANIMATIONTYPE_VECTOR3, 0)
    targetAnim.setKeys([
      { frame: 0, value: this.camera.target.clone() },
      { frame: 45, value: pos }
    ])
    targetAnim.setEasingFunction(ease)

    const radiusAnim = new Animation('camRadius', 'radius', 60, Animation.ANIMATIONTYPE_FLOAT, 0)
    radiusAnim.setKeys([
      { frame: 0, value: this.camera.radius },
      { frame: 45, value: Math.min(this.camera.radius, 12) }
    ])
    radiusAnim.setEasingFunction(ease)

    this.scene.beginDirectAnimation(this.camera, [targetAnim, radiusAnim], 0, 45, false)
  }

  focusOnLayer(layerIndex) {
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
    this._faultCheckInterval && clearInterval(this._faultCheckInterval)
    window.removeEventListener('resize', this._resizeHandler)

    this._faultHighlights.forEach((group, key) => {
      this._removeFaultHighlight(key)
    })
    this._faultHighlights.clear()
    this._faultAnimations.clear()

    if (this._pointerObserver && this.scene) {
      this.scene.onPointerObservable.remove(this._pointerObserver)
      this._pointerObserver = null
    }

    if (this.engine) {
      this.engine.stopRenderLoop()
    }

    if (this._labelCells) this._labelCells.clear()
    if (this.shuttleColors) this.shuttleColors = {}
    if (this.animatingShuttles) this.animatingShuttles.clear()

    this.shuttleMeshes.forEach((group, code) => {
      this.scene.stopAnimation(group)
      if (group.metadata) {
        if (group.metadata.bodyMaterial) group.metadata.bodyMaterial.dispose()
        if (group.metadata.ledMaterial) group.metadata.ledMaterial.dispose()
        if (group.metadata.labelMaterial) group.metadata.labelMaterial.dispose()
        if (group.metadata.sensorMaterials) {
          group.metadata.sensorMaterials.forEach(m => m && m.dispose())
        }
      }
      group.getChildMeshes().forEach(m => {
        if (m.geometry) m.geometry.dispose()
        m.dispose()
      })
      if (group.geometry) group.geometry.dispose()
      group.dispose()
    })
    this.shuttleMeshes.clear()

    this.cargoMeshes.forEach(cargo => {
      if (cargo.material) {
        this._allMaterials.delete(cargo.material)
        cargo.material.dispose()
      }
      if (cargo.geometry) cargo.geometry.dispose()
      cargo.dispose()
    })
    this.cargoMeshes.clear()

    this._instancedMeshes.forEach(im => {
      try {
        if (im.geometry && !im.isDisposed()) {
          if (im.sourceMesh && im.sourceMesh.geometry === im.geometry) {
          } else {
            im.geometry.dispose()
          }
        }
        if (!im.isDisposed()) im.dispose()
      } catch (e) { /* ignore */ }
    })
    this._instancedMeshes = []

    this._allMaterials.forEach(mat => {
      try {
        if (mat.dispose) mat.dispose()
      } catch (e) { /* ignore */ }
    })
    this._allMaterials.clear()

    this._allTextures.forEach(tex => {
      try {
        if (tex.dispose) tex.dispose()
      } catch (e) { /* ignore */ }
    })
    this._allTextures.clear()

    this._sharedMaterials.clear()

    if (this.pipeline) {
      this.pipeline.dispose()
      this.pipeline = null
    }
    if (this.glowLayer) {
      this.glowLayer.dispose()
      this.glowLayer = null
    }
    if (this.shadowGenerator) {
      this.shadowGenerator.dispose()
      this.shadowGenerator = null
    }

    if (this.scene) {
      this.scene.dispose()
      this.scene = null
    }
    if (this.engine) {
      this.engine.dispose()
      this.engine = null
    }

    this.trackMeshes.clear()
    this.rackMeshes.clear()
    this.powerLineMeshes.clear()
  }
}

export default RackSceneEngine
