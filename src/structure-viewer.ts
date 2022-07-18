/* eslint-disable @typescript-eslint/no-non-null-assertion */
import "molstar/lib/mol-util/polyfill";
import { createPlugin } from "molstar/lib/mol-plugin-ui";
import { DefaultPluginUISpec } from "molstar/lib/mol-plugin-ui/spec";
import { PluginContext } from "molstar/lib/mol-plugin/context";
import { PluginSpec } from "molstar/lib/mol-plugin/spec";
import {
  DownloadStructure,
  PdbDownloadProvider,
} from "molstar/lib/mol-plugin-state/actions/structure";
import { PluginConfig } from "molstar/lib/mol-plugin/config";
import {
  StructureElement,
  StructureProperties,
  StructureSelection,
} from "molstar/lib/mol-model/structure";
import { PluginLayoutControlsDisplay } from "molstar/lib/mol-plugin/layout";
import { Script } from "molstar/lib/mol-script/script";
import { StructureRepresentationPresetProvider } from "molstar/lib/mol-plugin-state/builder/structure/representation-preset";
import { PluginCommands } from "molstar/lib/mol-plugin/commands";
import { Color } from "molstar/lib/mol-util/color";
import { ConfidenceColorThemeProvider } from './confidence/color'
// import AfConfidenceScore from "./af-confidence/behavior";
import { PhysicochemicalColorThemeProvider } from './physicochemical/color'
import { InteractionColorThemeProvider } from "./interaction/color"
export type SupportedFormats = 'cif' | 'pdb'
import "molstar/build/viewer/molstar.css";

//主题色相关
import { ColorTheme } from 'molstar/lib/mol-theme/color';
import { StructureRepresentationRegistry } from 'molstar/lib/mol-repr/structure/registry';
import { StateBuilder, StateObject } from 'molstar/lib/mol-state';
import { PluginStateObject, PluginStateObject as PSO } from 'molstar/lib/mol-plugin-state/objects';
import { StateTransforms } from 'molstar/lib/mol-plugin-state/transforms';
import { createStructureRepresentationParams } from 'molstar/lib/mol-plugin-state/helpers/structure-representation-params';
interface LoadStructureOptions {
  representationParams?: StructureRepresentationPresetProvider.CommonParams;
}

const viewerOptions = {
  layoutIsExpanded: false,
  layoutShowControls: false,
  layoutShowRemoteState: false,
  layoutControlsDisplay: "reactive" as PluginLayoutControlsDisplay,
  layoutShowSequence: false,
  layoutShowLog: false,
  layoutShowLeftPanel: false,
  disableAntialiasing: false,
  pixelScale: 1,
  enableWboit: false,
  viewportShowExpand: true,
  viewportShowSelectionMode: false,
  viewportShowAnimation: false,
  pdbProvider: "pdbe",
  viewportShowControls: PluginConfig.Viewport.ShowControls.defaultValue,
  viewportShowSettings: PluginConfig.Viewport.ShowSettings.defaultValue,
};

export interface RepresentationStyle {
  kind?: StructureRepresentationRegistry.BuiltIn
  coloring?: ColorTheme.BuiltIn
}
export enum StateElements {
  Model = 'model',
  Assembly = 'assembly',
  Sequence = 'sequence',
  SequenceVisual = 'sequence-visual',
}

class StructureViewer {
  plugin: PluginContext;

  constructor(
    elementOrId: string | HTMLElement,
    onHighlightClick: (sequencePositions: number[]) => void
  ) {
    const defaultSpec = DefaultPluginUISpec(); // TODO: Make our own to select only essential plugins
    const spec: PluginSpec = {
      actions: defaultSpec.actions,
      behaviors: [
        ...defaultSpec.behaviors,
        // PluginSpec.Behavior(AfConfidenceScore, {
        //   autoAttach: true,
        //   showTooltip: true,
        //}),
      ],
      layout: {
        initial: {
          isExpanded: viewerOptions.layoutIsExpanded,
          showControls: viewerOptions.layoutShowControls,
          controlsDisplay: viewerOptions.layoutControlsDisplay,
        },
      },
      config: [
        [
          PluginConfig.General.DisableAntialiasing,
          viewerOptions.disableAntialiasing,
        ],
        [PluginConfig.General.PixelScale, viewerOptions.pixelScale],
        [PluginConfig.General.EnableWboit, viewerOptions.enableWboit],
        [PluginConfig.Viewport.ShowExpand, viewerOptions.viewportShowExpand],
        [
          PluginConfig.Viewport.ShowSelectionMode,
          viewerOptions.viewportShowSelectionMode,
        ],
        // [PluginConfig.Download.DefaultPdbProvider, viewerOptions.pdbProvider],
        // [
        //   PluginConfig.Structure.DefaultRepresentationPresetParams,
        //   {
        //     theme: {
        //       globalName: "af-confidence",
        //       carbonByChainId: false,
        //       focus: {
        //         name: "element-symbol",
        //         params: { carbonByChainId: false },
        //       },
        //     },
        //   },
        // ],
      ],
    };

    const element =
      typeof elementOrId === "string"
        ? document.getElementById(elementOrId)
        : elementOrId;
    if (!element)
      throw new Error(`Could not get element with id '${elementOrId}'`);
    this.plugin = createPlugin(element, spec);
    this.plugin.representation.structure.themes.colorThemeRegistry.add(ConfidenceColorThemeProvider)
    this.plugin.representation.structure.themes.colorThemeRegistry.add(PhysicochemicalColorThemeProvider)
    this.plugin.representation.structure.themes.colorThemeRegistry.add(InteractionColorThemeProvider)
    this.plugin.behaviors.layout.leftPanelTabName.next('data')
    this.plugin.behaviors.interaction.click.subscribe((event) => {
      if (StructureElement.Loci.is(event.current.loci)) {
        const loc = StructureElement.Location.create();
        StructureElement.Loci.getFirstLocation(event.current.loci, loc);
        // auth_seq_id  : UniProt coordinate space
        // label_seq_id : PDB coordinate space 
        const sequencePosition = StructureProperties.residue.label_seq_id(loc);
        onHighlightClick([sequencePosition]);
      }
    });

    // PluginCommands.Canvas3D.SetSettings(this.plugin, {
    //   settings: (props) => {
    //     // eslint-disable-next-line no-param-reassign
    //     props.renderer.backgroundColor = Color(0xffffff);
    //   },
    // });
    PluginCommands.Canvas3D.SetSettings(this.plugin, {
      settings: {
        trackball: {
          ...this.plugin.canvas3d!.props.trackball,
          zoomSpeed: 1,
          rotateSpeed: 1
        }
      }
    })
  }

  clear(message?: string): void {
    this.plugin.clear();
    if (message) {
      this.showMessage("Loading", message);
    }
  }

  loadPdb(pdb: string, options?: LoadStructureOptions): Promise<void> {
    const params = DownloadStructure.createDefaultParams(
      this.plugin.state.data.root.obj!,
      this.plugin
    );
    const provider = this.plugin.config.get(
      PluginConfig.Download.DefaultPdbProvider
    )!;
    return this.plugin
      .runTask(
        this.plugin.state.data.applyAction(DownloadStructure, {
          source: {
            name: "pdb" as const,
            params: {
              provider: {
                id: pdb,
                server: {
                  name: provider,
                  params: PdbDownloadProvider[provider].defaultValue as any,
                },
              },
              options: {
                ...params.source.params.options,
                representationParams: options?.representationParams as any,
              },
            },
          },
        })
      )
      .then(() => {
        this.clearMessages();
      });
  }

  async loadCifUrl(id: string, url: string): Promise<void> {
    const { plugin } = this;

    const data = await plugin.builders.data.download(
      { url, isBinary: false },
      { state: { isGhost: true } }
    );

    const trajectory = await plugin.builders.structure.parseTrajectory(
      data,
      "mmcif"
    );

    return this.plugin.builders.structure.hierarchy
      .applyPreset(trajectory, "all-models", { useDefaultIfSingleModel: true })
      .then(() => this.clearMessages());
  }

  highlight(ranges: { start: number; end: number }[]): void {
    // What nightingale calls "highlight", mol* calls "select"
    // The query in this method is over label_seq_id so the provided start & end
    // coordinates must be in PDB space
    const data =
      this.plugin.managers.structure.hierarchy.current.structures[0]?.cell.obj
        ?.data;
    if (!data) return;
    const sel = Script.getStructureSelection(
      (Q) =>
        Q.struct.generator.atomGroups({
          "residue-test": Q.core.logic.or(
            ranges.map(({ start, end }) =>
              Q.core.rel.inRange([
                Q.struct.atomProperty.macromolecular.label_seq_id(),
                start,
                end,
              ])
            )
          ),
        }),
      data
    );
    const loci = StructureSelection.toLociWithSourceUnits(sel);
    this.plugin.managers.camera.focusLoci(loci);
    this.plugin.managers.interactivity.lociSelects.selectOnly({ loci });
  }

  clearHighlight(): void {
    this.plugin.managers.interactivity.lociSelects.deselectAll();
    PluginCommands.Camera.Reset(this.plugin, {});
  }

  showMessage(title: string, message: string, timeoutMs?: number): void {
    this.clearMessages();
    PluginCommands.Toast.Show(this.plugin, {
      title,
      message,
      timeoutMs,
    });
  }

  clearMessages(): void {
    PluginCommands.Toast.Hide(this.plugin);
  }

  handleResize(): void {
    this.plugin.layout.events.updated.next();
  }
  //主题颜色
  setZoomSpeed() {
    PluginCommands.Canvas3D.SetSettings(this.plugin, {
      settings: {
        trackball: {
          ...this.plugin.canvas3d!.props.trackball,
          zoomSpeed: 1,
          rotateSpeed: 1
        }
      }
    })
  }
  private structure() {
    const model = this.state.build().to(StateElements.Model);
    const props = {
      type: {
        name: 'model' as const,
        params: {}
      }
    };

    const s = model
      .apply(StateTransforms.Model.StructureFromModel, props, { ref: StateElements.Assembly });

    s.apply(StateTransforms.Model.StructureComplexElement, { type: 'atomic-sequence' }, { ref: StateElements.Sequence });
    return s;
  }
  private model(b: StateBuilder.To<PSO.Data.Binary | PSO.Data.String>, format: SupportedFormats) {
    const parsed = format === 'cif'
      ? b.apply(StateTransforms.Data.ParseCif).apply(StateTransforms.Model.TrajectoryFromMmCif)
      : b.apply(StateTransforms.Model.TrajectoryFromPDB);

    return parsed
      .apply(StateTransforms.Model.ModelFromTrajectory, { modelIndex: 0 }, { ref: StateElements.Model });
  }
  private rawData(b: StateBuilder.To<PSO.Root>, data: string) {
    return b.apply(StateTransforms.Data.RawData, { data });
  }
  private applyState(tree: StateBuilder) {
    return PluginCommands.State.Update(this.plugin, { state: this.plugin.state.data, tree });
  }
  async loadStructureFromData(data: string, format: SupportedFormats) {
    await this.plugin.clear();
    const state = this.plugin.state.data
    const modelTree = this.model(this.rawData(state.build().toRoot(), data), format);
    await this.applyState(modelTree);
    const structureTree = this.structure();
    await this.applyState(structureTree);
    await this.updateStyle()
  }
  get state() {
    return this.plugin.state.data;
  }
  private getObj<T extends StateObject>(ref: string): T['data'] {
    const state = this.state;
    const cell = state.select(ref)[0];
    if (!cell || !cell.obj) return void 0;
    return (cell.obj as T).data;
  }
  private visual(_style?: RepresentationStyle) {
    const structure = this.getObj<PluginStateObject.Molecule.Structure>(StateElements.Assembly);
    if (!structure) return;

    const style = _style || {};

    const update = this.state.build();

    const root = update.to(StateElements.Sequence);
    root.applyOrUpdate(StateElements.SequenceVisual, StateTransforms.Representation.StructureRepresentation3D,
      createStructureRepresentationParams(
        this.plugin,
        structure,
        {
          type: style.kind || 'cartoon',
          color: style.coloring || 'unit-index',
          size: 'uniform',
          typeParams: {
            alpha: 1
          }
        })
    );
    return update;
  }

  async updateStyle(style?: RepresentationStyle) {
    const tree = this.visual(style);

    if (!tree) return;
    await PluginCommands.State.Update(this.plugin, { state: this.plugin.state.data, tree });
  }
  coloring = {
    applyCartoon: async () => {
      await this.updateStyle({
        kind: 'cartoon',
        coloring: 'chain-id'
      })
    },
    applyConfidence: async () => {
      await this.updateStyle({
        kind: 'cartoon',
        coloring: 'confidence' as any
      })
    },
    applyPhysicochemical: async () => {
      await this.updateStyle({
        kind: 'gaussian-surface',
        coloring: 'physicochemical' as any
      })
    },
    applyInteraction: async () => {
      await this.updateStyle({
        kind: 'cartoon',
        coloring: 'interaction' as any
      })
    },
  }
  async setViewerDisplay(type: string) {
    if (type === 'confidence') {
      this.coloring.applyConfidence()
    } else if (type === 'physicochemical') {
      this.coloring.applyPhysicochemical()
    } else if (type === 'interaction') {
      this.coloring.applyInteraction()
    } else {
      this.coloring.applyCartoon()
    }
  }
}

export default StructureViewer;
