import { Column } from "molstar/lib/mol-data/db";
import { CustomModelProperty } from "molstar/lib/mol-model-props/common/custom-model-property";
import { CustomProperty } from "molstar/lib/mol-model-props/common/custom-property";
import { CustomPropertyDescriptor } from "molstar/lib/mol-model/custom-property";
import { Model, StructureElement, Unit, IndexedCustomProperty, ResidueIndex, Structure } from "molstar/lib/mol-model/structure";
import { ParamDefinition, ParamDefinition as PD } from 'molstar/lib/mol-util/param-definition';
import { PropertyWrapper } from 'molstar/lib/mol-model-props/common/wrapper';
import { toTable } from "molstar/lib/mol-io/reader/cif/schema";
import { MmcifFormat } from 'molstar/lib/mol-model-formats/structure/mmcif';
import { arraySetAdd } from 'molstar/lib/mol-util/array';
import { dateToUtcString } from 'molstar/lib/mol-util/date';

type ConfidenceType = PropertyWrapper<{
    score: IndexedCustomProperty.Residue<string[]>,
    category: string[]
}| undefined>


const Schema = {
    local_metric_values: {
        label_asym_id: Column.Schema.str,
        label_comp_id: Column.Schema.str,
        label_seq_id: Column.Schema.int,
        plddt: Column.Schema.float
    }
}

type SchemaType = typeof Schema

function getCifData(model: Model) {
    if (!MmcifFormat.is(model.sourceData)) throw new Error('Data format must be mmCIF.');
    return {
        residues: toTable(Schema.local_metric_values, model.sourceData.data.frame.categories.seq_label),
    }
}

function createScoreMapFromCif (modelData: Model, residueData: any) {
    const ret = new Map<ResidueIndex, string[]>();
    const {
        label_asym_id,
        label_seq_id,
        plddt,
        _rowCount
    } = residueData;
    const category: string[] = [];

    for (let i = 0; i < _rowCount; i++) {
        const value = plddt.value(i)
        const index = modelData.atomicHierarchy.index.findResidue('1', label_asym_id.value(i), label_seq_id.value(i), '')
        let str = 'Very low'
        if (value > 50 && value <= 70) {
            str = 'Low'
        } else if (value > 70 && value <= 90) {
            str = 'Confident'
        } else if (value > 90) {
            str = 'Very high'
        }
        ret.set(index, [value, str])
        arraySetAdd(category, str)
    }

    return {
        score: IndexedCustomProperty.fromResidueMap(ret),
        category
    };
}

interface IConfidence {
    DefaultServerUrl: string
    isApplicable: (model?: Model) => boolean
    Schema: SchemaType,
    getConfidenceScore: (e: StructureElement.Location) => any
    getCategories: (structure?: Structure) => any
    fromCif: (ctx: CustomProperty.Context, model: Model) => any,
    fromCifOrServer: (ctx: CustomProperty.Context, model: Model, props: ConfidenceProps) => any
}

export const Confidence: IConfidence = {
    DefaultServerUrl: '',
    isApplicable(model?: Model): boolean {
        return !!model;
    },
    Schema,
    getConfidenceScore: (e: StructureElement.Location) => {
        const _emptyArray = [-1, 'No Score']
        if (!Unit.isAtomic(e.unit)) {
            return _emptyArray
        }
        const prop = ConfidenceProvider.get(e.unit.model).value;
        if (!prop || !prop.data) {
            return _emptyArray
        }
        var rI = e.unit.residueIndex[e.element];
        return prop.data.score.has(rI) ? prop.data.score.get(rI)! : _emptyArray
    },
    getCategories(structure?: Structure) {
        const _emptyArray = [] as any[]
        if (!structure) return _emptyArray
        const prop = ConfidenceProvider.get(structure.models[0]).value
        if (!prop || !prop.data) return _emptyArray
        return prop.data.category
    },
    fromCif (ctx: CustomProperty.Context, model: Model) {
        let info
        if (MmcifFormat.is(model.sourceData) && model.sourceData.data.frame.categoryNames.includes('seq_label')) {
            const v = model.sourceData.data.frame.categories['seq_label'].getField('plddt')
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
    async fromCifOrServer (ctx: CustomProperty.Context, model: Model, props: ConfidenceProps) {
        const cif = this.fromCif(ctx, model);
        return { value: cif }
    }
}


export const ConfidenceParams = {
    serverUrl: ParamDefinition.Text(Confidence.DefaultServerUrl, {
        description: "JSON API Server URL"
    })
}

export type ConfidenceParamsType = typeof ConfidenceParams
export type ConfidenceProps = PD.Values<ConfidenceParamsType>

export const ConfidenceProvider: CustomModelProperty.Provider<ConfidenceParamsType, ConfidenceType> = CustomModelProperty.createProvider({
    label: "Confidence Score",
    descriptor: CustomPropertyDescriptor({
        name: "confidence_score"
    }),
    type: "static",
    defaultParams: ConfidenceParams,
    getParams: (data: Model) => ConfidenceParams,
    isApplicable: (data: Model) => Confidence.isApplicable(data),
    obtain: async (ctx: CustomProperty.Context, data: Model, props: Partial<ConfidenceProps>) => {
        const p = { ...PD.getDefaultValues(ConfidenceParams), ...props };
        return await Confidence.fromCifOrServer(ctx, data, p);
    }
})