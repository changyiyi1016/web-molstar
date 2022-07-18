import { Column } from "molstar/lib/mol-data/db";
import { CustomModelProperty } from "molstar/lib/mol-model-props/common/custom-model-property";
import { CustomProperty } from "molstar/lib/mol-model-props/common/custom-property";
import { CustomPropertyDescriptor } from "molstar/lib/mol-model/custom-property";
import { Model, StructureElement, Unit, IndexedCustomProperty, ResidueIndex, Structure } from "molstar/lib/mol-model/structure";
import { ParamDefinition, ParamDefinition as PD } from 'molstar/lib/mol-util/param-definition';
import { PropertyWrapper } from 'molstar/lib/mol-model-props/common/wrapper';
import { toTable } from "molstar/lib/mol-io/reader/cif/schema";
import { MmcifFormat } from 'molstar/lib/mol-model-formats/structure/mmcif';
// import { arraySetAdd } from 'molstar/lib/mol-util/array';
import { dateToUtcString } from 'molstar/lib/mol-util/date';
import { GradientColors } from "./utils";

type PhysicochemicalType = PropertyWrapper<{
    score: IndexedCustomProperty.Residue<string[]>,
    category: string[]
} | undefined>


const Schema = {
    seq_label: {
        label_asym_id: Column.Schema.str,
        label_comp_id: Column.Schema.str,
        label_seq_id: Column.Schema.int,
        physicochemical: Column.Schema.float
    }
}

type SchemaType = typeof Schema

function getCifData(model: Model) {
    if (!MmcifFormat.is(model.sourceData)) throw new Error('Data format must be mmCIF.');
    return {
        residues: toTable(Schema.seq_label, model.sourceData.data.frame.categories.seq_label),
    }
}

function createScoreMapFromCif(modelData: Model, residueData: any) {
    const ret = new Map<ResidueIndex, string[]>();
    const {
        label_asym_id,
        label_seq_id,
        physicochemical,
        _rowCount
    } = residueData;
    const category: string[] = [];
    const colors = ['rgb(0, 0, 255)', 'rgb(255, 255, 255)', 'rgb(255, 0, 0)']
    const step = 100
    const upperLimit = 1
    const lowerLimit = -1
    const gap = (upperLimit - (lowerLimit)) / step
    const colorsCard = GradientColors.getGradientColors(colors, step)
    for (let i = 0; i < _rowCount; i++) {
        const value = physicochemical.value(i)
        const index = modelData.atomicHierarchy.index.findResidue('1', label_asym_id.value(i), label_seq_id.value(i))
        const colorIndex = Math.floor((value - (lowerLimit)) / gap)
        ret.set(index, [value, colorsCard[colorIndex >= 100 ? 99 : (colorIndex <= 0 ? 0 : colorIndex)]])
    }

    return {
        score: IndexedCustomProperty.fromResidueMap(ret),
        category
    };
}

interface IPhysicochemical {
    DefaultServerUrl: string
    isApplicable: (model?: Model) => boolean
    Schema: SchemaType,
    getPhysicochemicalScore: (e: StructureElement.Location) => any
    getCategories: (structure?: Structure) => any
    fromCif: (ctx: CustomProperty.Context, model: Model) => any,
    fromCifOrServer: (ctx: CustomProperty.Context, model: Model, props: PhysicochemicalProps) => any
}

export const Physicochemical: IPhysicochemical = {
    DefaultServerUrl: '',
    isApplicable(model?: Model): boolean {
        return !!model;
    },
    Schema,
    getPhysicochemicalScore: (e: StructureElement.Location) => {
        const _emptyArray = [-1, '255,255,255']
        if (!Unit.isAtomic(e.unit)) {
            return _emptyArray
        }
        const prop = PhysicochemicalProvider.get(e.unit.model).value;
        if (!prop || !prop.data) {
            return _emptyArray
        }
        var rI = e.unit.residueIndex[e.element];
        return prop.data.score.has(rI) ? prop.data.score.get(rI)! : _emptyArray
    },
    getCategories(structure?: Structure) {
        const _emptyArray = [] as any[]
        if (!structure) return _emptyArray
        const prop = PhysicochemicalProvider.get(structure.models[0]).value
        if (!prop || !prop.data) return _emptyArray
        return prop.data.category
    },
    fromCif(ctx: CustomProperty.Context, model: Model) {
        let info
        if (MmcifFormat.is(model.sourceData) && model.sourceData.data.frame.categoryNames.includes('seq_label')) {
            const v = model.sourceData.data.frame.categories['seq_label'].getField('physicochemical')
            if (v && v.rowCount !== 0) {
                info = {
                    timestamp_utc: v.str(0) || dateToUtcString(new Date())
                }
            }
        }
        if (!info) return;
        const data = getCifData(model);
        const scoreMap = createScoreMapFromCif(model, data.residues);
        return { info, data: scoreMap };
    },
    async fromCifOrServer(ctx: CustomProperty.Context, model: Model, props: PhysicochemicalProps) {
        const cif = this.fromCif(ctx, model);
        return { value: cif }
    }
}


export const PhysicochemicalParams = {
    serverUrl: ParamDefinition.Text(Physicochemical.DefaultServerUrl, {
        description: "JSON API Server URL"
    })
}

export type PhysicochemicalParamsType = typeof PhysicochemicalParams
export type PhysicochemicalProps = PD.Values<PhysicochemicalParamsType>


export const PhysicochemicalProvider: CustomModelProperty.Provider<PhysicochemicalParamsType, PhysicochemicalType> = CustomModelProperty.createProvider({
    label: "Physicochemical Score",
    descriptor: CustomPropertyDescriptor({
        name: "physicochemical_score"
    }),
    type: "static",
    defaultParams: PhysicochemicalParams,
    getParams: (data: Model) => PhysicochemicalParams,
    isApplicable: (data: Model) => Physicochemical.isApplicable(data),
    obtain: async (ctx: CustomProperty.Context, data: Model, props: Partial<PhysicochemicalProps>) => {
        const p = { ...PD.getDefaultValues(PhysicochemicalParams), ...props };
        return await Physicochemical.fromCifOrServer(ctx, data, p);
    }
})