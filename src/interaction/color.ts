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
import { Interaction, InteractionProvider } from './prop';
import { CustomProperty } from 'molstar/lib/mol-model-props/common/custom-property';
 
interface IScoreColors {
    'A': Color,
    'AI': Color,
    'B': Color,
    'BI': Color,
}
type scoreType = keyof IScoreColors


const scoreColors: IScoreColors = {
    'A': Color.fromRgb(170, 170, 170),
    'AI': Color.fromRgb(0, 83, 214),
    'B': Color.fromRgb(170, 170, 170),
    'BI': Color.fromRgb(255, 125, 69),
}


 export const InteractionColorThemeParams = {
    type: PD.MappedStatic('score', {
        'score': PD.Group({}),
        'category': PD.Group({
            kind: PD.Text()
        })
    })
};

type Params = typeof InteractionColorThemeParams


export function InteractionColorTheme(ctx: ThemeDataContext, props: PD.Values<Params>): ColorTheme<Params> {
    let color: LocationColor;
    if (ctx.structure && !ctx.structure.isEmpty && ctx.structure.models[0].customProperties.has(InteractionProvider.descriptor)) {
        const getInteractionScore = Interaction.getInteractionScore;
        if (props.type.name === 'score') {
            color = (location: Location) => {
                if (StructureElement.Location.is(location)) {
                    const str = getInteractionScore(location)[1]
                    return scoreColors[str as scoreType]
                }
                return scoreColors['B'];
            };
        } else {
            const kind = props.type.params.kind;
            color = (location: Location) => {
                if (StructureElement.Location.is(location)) {
                    const str = getInteractionScore(location)[1] as scoreType
                    return str === kind ? scoreColors[str] : scoreColors['B']
                }
                return scoreColors['B']
            };
        }
    } else {
        color = () => scoreColors['B']
    }

    return {
        factory: InteractionColorTheme,
        granularity: 'group',
        preferSmoothing: true,
        color,
        props,
        description: 'Protein Interaction Interface Structural Alignment',
    };

}


export const InteractionColorThemeProvider: ColorTheme.Provider<Params, 'interaction'> = {
    name: 'interaction',
    label: 'Interaction',
    category: 'Validation',
    factory: InteractionColorTheme,
    // @ts-ignore
    getParams: ctx => {
        const categories = Interaction.getCategories(ctx.structure);
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
    defaultValues: PD.getDefaultValues(InteractionColorThemeParams),
    isApplicable: (ctx: ThemeDataContext) => Interaction.isApplicable(ctx.structure?.models[0]),
    ensureCustomProperties: {
        attach: (ctx: CustomProperty.Context, data: ThemeDataContext) => data.structure ? InteractionProvider.attach(ctx, data.structure.models[0], void 0, true) : Promise.resolve(),
        detach: (data) => data.structure && InteractionProvider.ref(data.structure.models[0], false)
    }
};
 