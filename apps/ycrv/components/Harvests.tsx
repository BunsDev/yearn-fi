import {useMemo, useState} from 'react';
import {toAddress} from '@builtbymom/web3/utils';
import {Button} from '@yearn-finance/web-lib/components/Button';
import {
	LPYCRV_TOKEN_ADDRESS,
	LPYCRV_V2_TOKEN_ADDRESS,
	STYCRV_TOKEN_ADDRESS
} from '@yearn-finance/web-lib/utils/constants';
import {HarvestListHead} from '@yCRV/components/HarvestsListHead';
import {HarvestListRow} from '@yCRV/components/HarvestsListRow';
import {useYCRV} from '@yCRV/contexts/useYCRV';

import type {ReactElement} from 'react';
import type {TYDaemonVaultHarvest, TYDaemonVaultHarvests} from '@common/schemas/yDaemonVaultsSchemas';

export function Harvests(): ReactElement {
	const {harvests} = useYCRV();
	const [category, set_category] = useState('all');

	const filteredHarvests = useMemo((): TYDaemonVaultHarvests => {
		const _harvests = [...(harvests || [])];
		if (category === 'st-yCRV') {
			return _harvests.filter((harvest): boolean => toAddress(harvest.vaultAddress) === STYCRV_TOKEN_ADDRESS);
		}
		if (category === 'lp-yCRV') {
			return _harvests.filter(
				(harvest): boolean =>
					toAddress(harvest.vaultAddress) === LPYCRV_TOKEN_ADDRESS ||
					toAddress(harvest.vaultAddress) === LPYCRV_V2_TOKEN_ADDRESS
			);
		}
		return _harvests;
	}, [category, harvests]);

	return (
		<div className={'col-span-12 flex w-full flex-col bg-neutral-100'}>
			<div
				className={
					'flex flex-row items-center justify-between space-x-6 px-4 pb-2 pt-4 md:space-x-0 md:px-10 md:pb-8 md:pt-10'
				}>
				<div className={'w-1/2 md:w-auto'}>
					<h2 className={'text-lg font-bold md:text-3xl'}>{'Harvests'}</h2>
				</div>
				<div className={'flex flex-row space-x-0 divide-x border-x border-neutral-900'}>
					<Button
						onClick={(): void => set_category('all')}
						variant={category === 'all' ? 'filled' : 'outlined'}
						className={'yearn--button-smaller !border-x-0'}>
						{'All'}
					</Button>
					<Button
						onClick={(): void => set_category('st-yCRV')}
						variant={category === 'st-yCRV' ? 'filled' : 'outlined'}
						className={'yearn--button-smaller !border-x-0'}>
						{'st-yCRV'}
					</Button>
					<Button
						onClick={(): void => set_category('lp-yCRV')}
						variant={category === 'lp-yCRV' ? 'filled' : 'outlined'}
						className={'yearn--button-smaller !border-x-0'}>
						{'lp-yCRV'}
					</Button>
				</div>
			</div>
			<div className={'mt-4 grid w-full grid-cols-1 md:mt-0'}>
				<HarvestListHead />
				{(filteredHarvests || [])?.map((harvest: TYDaemonVaultHarvest, index: number): ReactElement => {
					return (
						<HarvestListRow
							key={`${harvest.timestamp}_${harvest.vaultAddress}_${index}`}
							harvest={harvest}
						/>
					);
				})}
			</div>
		</div>
	);
}
