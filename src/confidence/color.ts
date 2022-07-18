/**
 * Copyright (c) 2019 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author Alexander Rose <alexander.rose@weirdbyte.de>
 * @author David Sehnal <david.sehnal@gmail.com>
 */


 import { StructureElement } from 'molstar/lib/mol-model/structure';
 import { Color } from 'molstar/lib/mol-util/color';
 import { Location } from 'molstar/lib/mol-model/location';
 import { ColorTheme, LocationColor } from 'molstar/lib/mol-theme/color';
 import { ParamDefinition as PD } from 'molstar/lib/mol-util/param-definition';
 import { ThemeDataContext } from 'molstar/lib/mol-theme/theme';
import { Confidence, ConfidenceProvider } from './prop';
import { CustomProperty } from 'molstar/lib/mol-model-props/common/custom-property';
 
interface IScoreColors {
    'No Score': Color,
    'Very low': Color,
    'Low': Color,
    'Confident': Color,
    'Very high': Color
}
type scoreType = keyof IScoreColors


const scoreColors: IScoreColors = {
    'No Score': Color.fromRgb(170, 170, 170),
    'Very low': Color.fromRgb(242, 240, 19),
    'Low': Color.fromRgb(206, 229, 208),
    'Confident': Color.fromRgb(52, 190, 130),
    'Very high': Color.fromRgb(47, 134, 166),
}


 export const ConfidenceColorThemeParams = {
    type: PD.MappedStatic('score', {
        'score': PD.Group({}),
        'category': PD.Group({
            kind: PD.Text()
        })
    })
};

type Params = typeof ConfidenceColorThemeParams


export function ConfidenceColorTheme(ctx: ThemeDataContext, props: PD.Values<Params>): ColorTheme<Params> {
    let color: LocationColor;
    if (ctx.structure && !ctx.structure.isEmpty && ctx.structure.models[0].customProperties.has(ConfidenceProvider.descriptor)) {
        const getConfidenceScore = Confidence.getConfidenceScore;
        if (props.type.name === 'score') {
            color = (location: Location) => {
                if (StructureElement.Location.is(location)) {
                    const str = getConfidenceScore(location)[1]
                    return scoreColors[str as scoreType]
                }
                return scoreColors['No Score'];
            };
        } else {
            const kind = props.type.params.kind;
            color = (location: Location) => {
                if (StructureElement.Location.is(location)) {
                    const str = getConfidenceScore(location)[1] as scoreType
                    return str === kind ? scoreColors[str] : scoreColors['No Score']
                }
                return scoreColors['No Score']
            };
        }
    } else {
        color = () => scoreColors['No Score']
    }

    return {
        factory: ConfidenceColorTheme,
        granularity: 'group',
        preferSmoothing: true,
        color,
        props,
        description: 'Assigns residue colors according to the AF Confidence score',
    };

}


export const ConfidenceColorThemeProvider: ColorTheme.Provider<Params, 'confidence'> = {
    name: 'confidence',
    label: 'Confidence',
    category: 'Validation',
    factory: ConfidenceColorTheme,
    // @ts-ignore
    getParams: ctx => {
        const categories = Confidence.getCategories(ctx.structure);
        if (categories.length === 0) {
            return {
                type: PD.MappedStatic('score', {
                    'score': PD.Group({})
                })
            };
        }

        return {
            type: PD.MappedStatic('score', {
                'score': PD.Group({}),
                'category': PD.Group({
                    kind: PD.Select(categories[0], PD.arrayToOptions(categories))
                }, { isFlat: true })
            })
        };
    },
    defaultValues: PD.getDefaultValues(ConfidenceColorThemeParams),
    isApplicable: (ctx: ThemeDataContext) => Confidence.isApplicable(ctx.structure?.models[0]),
    ensureCustomProperties: {
        attach: (ctx: CustomProperty.Context, data: ThemeDataContext) => data.structure ? ConfidenceProvider.attach(ctx, data.structure.models[0], void 0, true) : Promise.resolve(),
        detach: (data) => data.structure && ConfidenceProvider.ref(data.structure.models[0], false)
    }
};
 