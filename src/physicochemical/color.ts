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
import { Physicochemical, PhysicochemicalProvider } from './prop';
import { CustomProperty } from 'molstar/lib/mol-model-props/common/custom-property';
 
export const PhysicochemicalColorThemeParams = {
    type: PD.MappedStatic('score', {
        'score': PD.Group({}),
        'category': PD.Group({
            kind: PD.Text()
        })
    })
};

type Params = typeof PhysicochemicalColorThemeParams


export function PhysicochemicalColorTheme(ctx: ThemeDataContext, props: PD.Values<Params>): ColorTheme<Params> {
    let color: LocationColor;

    if (ctx.structure && !ctx.structure.isEmpty && ctx.structure.models[0].customProperties.has(PhysicochemicalProvider.descriptor)) {
        const getPhysicochemicalScore = Physicochemical.getPhysicochemicalScore;
        color = (location: Location) => {
            if (StructureElement.Location.is(location)) {
                const value = getPhysicochemicalScore(location)
                const color = value[1].split(',')
                return Color.fromRgb(color[0], color[1], color[2])
            }
            return Color.fromRgb(255, 255, 255);
        };
    } else {
        color = () => Color.fromRgb(255, 255, 255);
    }

    return {
        factory: PhysicochemicalColorTheme,
        granularity: 'group',
        preferSmoothing: true,
        color,
        props,
        description: 'Assigns residue colors according to the Physicochemical score',
    };

}


export const PhysicochemicalColorThemeProvider: ColorTheme.Provider<Params, 'physicochemical'> = {
    name: 'physicochemical',
    label: 'Physicochemical',
    category: 'Validation',
    factory: PhysicochemicalColorTheme,
    // @ts-ignore
    getParams: ctx => {
        const categories = Physicochemical.getCategories(ctx.structure);
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
    defaultValues: PD.getDefaultValues(PhysicochemicalColorThemeParams),
    isApplicable: (ctx: ThemeDataContext) => Physicochemical.isApplicable(ctx.structure?.models[0]),
    ensureCustomProperties: {
        attach: (ctx: CustomProperty.Context, data: ThemeDataContext) => data.structure ? PhysicochemicalProvider.attach(ctx, data.structure.models[0], void 0, true) : Promise.resolve(),
        detach: (data) => data.structure && PhysicochemicalProvider.ref(data.structure.models[0], false)
    }
};
 