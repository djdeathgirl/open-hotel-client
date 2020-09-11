import { SetType, HumanFigureProps, PartType, HumanGroupName, HumanGroup } from './humanImagerTypes'
import { Container, Sprite, Texture } from 'pixi.js'
import { HumanFigure } from './figure.util'
import { HumanPart, HumanChunkProps, calcFlip } from './HumanPart'
import { HumanDirection } from './direction.enum'
import { HumanImager } from '../human.imager'

export class RenderTree {
  constructor(
    private humanImager: HumanImager,
    public actions: any[]
  ) {}

  groups: Record<PartType, HumanPart[]>
  canvas: any
  container: Container

  build(setTypes: SetType[], options: HumanFigureProps) {
    const { actions } = this
    const lastAction = actions[actions.length - 1]

    const hiddenLayers = new Set<string>()

    const groupRenderTree = setTypes
      .flatMap(setType => {
        if (setType.set.hiddenLayers) {
          setType.set.hiddenLayers.forEach(part => hiddenLayers.add(part))
        }

        return setType.set.parts.map(part => ({ ...part, setType }))
      })
      .reduce((acc, part) => {
        if (hiddenLayers.has(part.type)) {
          return acc
        }

        if (!acc[part.type]) {
          acc[part.type] = []
        }

        const libName = HumanFigure.getLib(
          this.humanImager.figuremap,
          part.type,
          part.id
        )

        const isHeadPart = HumanFigure.isFromPartSet(this.humanImager.partsets, 'head', part.type)

        const humanPart = new HumanPart({
          id: part.id,
          tint: part.colorable ? part.setType.colors[part.colorindex - 1] : null,
          type: part.type,
          lib: libName,
          part,
          direction: isHeadPart
            ? options.head_direction
            : options.direction
        })

        acc[part.type].push(humanPart)

        return acc
      }, <Record<PartType, HumanPart[]>>{})

    this.groups = groupRenderTree;
    this.canvas = this.humanImager.geometry.canvas[options.size || 'h'][lastAction.geometrytype]
    this.applyActions()

    return this
  }

  partTypeToContainer = <Record<PartType, Container>>{}

  createContainer(options: HumanFigureProps): Container {
    const lastAction = this.actions[this.actions.length - 1]
    const humanGroupDictionary: Record<HumanGroupName, HumanGroup> = this.humanImager.geometry.type[lastAction.geometrytype]

    const mainContainer = new Container()

    mainContainer.sortableChildren = true

    for (const [groupName, group] of Object.entries(humanGroupDictionary)) {
      const groupContainer = new Container()

      groupContainer.sortableChildren = true
      groupContainer.name = groupName

      const direction = groupName === 'head' ? options.head_direction : options.direction

      // TODO: how to fix indexes?
      if (groupName === 'rightarm' || groupName === 'leftarm') {
        group.z = -1
      }
      groupContainer.zIndex = group.zIndex = this.calcPointZIndex(direction, group)

      for (const [partType, groupItem] of Object.entries(group.items)) {
        const partGroup = this.groups[partType]

        if (!partGroup?.length) continue;

        const partContainer = new Container()
        this.partTypeToContainer[partType] = partContainer

        partContainer.name = partType
        partContainer.zIndex = groupItem.zIndex = this.calcPointZIndex(direction, groupItem)

        for (const humanPart of partGroup) {
          const sprite = new Sprite()
          this.updateSprite(sprite, humanPart)
          partContainer.addChild(sprite)
        }

        groupContainer.addChild(partContainer)
      }

      mainContainer.addChild(groupContainer)
    }

    return this.container = mainContainer
  }

  calcPointZIndex(direction: number, point): number {
    const angle = HumanDirection.DirectionAngles[direction]

    var angleInRad = ((angle * Math.PI) / 180)
    var cos: number = Math.cos(angleInRad);
    var sin: number = Math.sin(angleInRad);
    const vec4 = [cos, 0, sin, 0, 1, 0, -(sin), 0, cos]

    const vecMult = (vector4D, vector3D: any) => {
      var _local_2: Number = (((vector3D.x * vector4D[0]) + (vector3D.y * vector4D[3])) + (vector3D.z * vector4D[6]));
      var _local_3: Number = (((vector3D.x * vector4D[1]) + (vector3D.y * vector4D[4])) + (vector3D.z * vector4D[7]));
      var _local_4: Number = (((vector3D.x * vector4D[2]) + (vector3D.y * vector4D[5])) + (vector3D.z * vector4D[8]));
      return { x: _local_2, y: _local_3, z: _local_4 }
    }

    const vec3 = vecMult(vec4, point)

    const getDistance = (vec3) => {
      var min = Math.abs(((vec3.z - point.z) - point.radius));
      var max = Math.abs(((vec3.z - point.z) + point.radius));
      return (Math.min(min, max))
    }
    return getDistance(vec3)
  }

  getOffsetOf(humanPart: HumanPart, overrides: Partial<HumanChunkProps> = {}): [number, number] | undefined {
    const { manifest } = this.humanImager.loader.resources[`${humanPart.lib}/${humanPart.lib}.json`]
    const stateName = humanPart.buildState(overrides)
    const { offset = null } = manifest.assets[stateName] ?? {}
    return offset?.split(',').map(o => parseInt(o))
  }

  getTextureOf(humanPart: HumanPart, overrides: Partial<HumanChunkProps> = {}): Texture | undefined {
    const { spritesheet } = this.humanImager.loader.resources[`${humanPart.lib}/${humanPart.lib}.json`]
    return spritesheet.textures[
      humanPart.buildFilenameName(overrides)
    ]
  }

  getPartset(partType: string) {
    return this.humanImager.partsets.partSets[partType]
  }

  private applyActions () {
    for (const action of this.actions) {
      const activePartset = this.humanImager.partsets.activePartSets[action.activepartset]
      for (const partType of activePartset) {
        this.groups[partType]?.forEach((part: HumanPart) => part.assetpartdefinition = action.assetpartdefinition)
      }
    }
  }

  updateSprite(sprite: Sprite, humanPart: HumanPart) {
    let offsets = this.getOffsetOf(humanPart)
    let texture = this.getTextureOf(humanPart)
    let flipped = false

    if (!texture) {
      if (humanPart.type === 'ey' && humanPart.assetpartdefinition === 'std') {
        texture = this.getTextureOf(humanPart, { assetpartdefinition: 'sml' })
      }
      const partset = this.getPartset(humanPart.type)

      // Fliped texture and offsets
      if (!texture && humanPart.direction > 3 && humanPart.direction < 7) {
        const opts: Partial<HumanChunkProps> = {
          type: partset['flipped-set-type'] ?? humanPart.type,
          direction: calcFlip(humanPart.direction)
        }

        texture = this.getTextureOf(humanPart, opts)
        offsets = this.getOffsetOf(humanPart, opts)

        if (!texture) {
          Object.assign(opts, { assetpartdefinition: 'std', frame: 0 })
          offsets = this.getOffsetOf(humanPart, opts)
          texture = this.getTextureOf(humanPart, opts)
        }

        flipped = true
      }

      if (!texture) {
        const opts =  { assetpartdefinition: 'std', frame: 0 }
        offsets = this.getOffsetOf(humanPart, opts)
        texture = this.getTextureOf(humanPart, opts)
      }
    }

    sprite.texture = texture;

    if (offsets) {
      sprite.pivot.x = offsets[0]
      sprite.pivot.y = offsets[1]
    }

    if (flipped) {
      sprite.scale.x = -1
      sprite.pivot.x += 68
    }

    if (humanPart.tint !== null && humanPart.type !== 'ey') sprite.tint = humanPart.tint
  }

}
