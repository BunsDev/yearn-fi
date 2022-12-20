import {useCallback, useEffect, useMemo} from 'react';
import {BigNumber} from 'ethers';
import axios from 'axios';
import useSWRMutation from 'swr/mutation';
import {OrderKind} from '@gnosis.pm/gp-v2-contracts';
import {isZeroAddress} from '@yearn-finance/web-lib/utils/address';
import {formatBN} from '@yearn-finance/web-lib/utils/format.bigNumber';

import {usePortals} from './usePortals';
import {useWido} from './useWido';

import type {TAddress} from '@yearn-finance/web-lib/utils/address';
import type {TDict} from '@yearn-finance/web-lib/utils/types';
import type {Order, QuoteQuery} from '@gnosis.pm/gp-v2-contracts';
import type {TUsePortals} from './usePortals';
import type {TUseWido} from './useWido';

export type TWidoQuote = { req: { type: 'wido'; request: TUseWido['getWidoQuote'] }; res: TUseWido['widoQuote'] };
export type TPortalsQuote = { req: { type: 'portals'; request: TUsePortals['getPortalsQuote'] }; res: TUsePortals['portalsQuote'] };
export type TCowQuote = { req: { type: 'cowswap'; request: TCowRequest }; res: TCowResult };

type TExternalService<T> =
    T extends 'wido' ? TWidoQuote :
    T extends 'portals' ? TPortalsQuote :
	T extends 'cowswap' ? TCowQuote :
	never;

/* 🔵 - Yearn Finance ******************************************************
**	Cowswap Solver
***************************************************************************/
export type TCowRequest = {
	from: TAddress,
    sellToken: TAddress; // The ERC20 token address to spend
    buyToken: TAddress; // The ERC20 token address to buy (e.g. a Curve or Sushiswap pool, or a basic token like DAI). Use address(0) for the network token
    sellAmount: BigNumber; // The quantity of `sellToken` to spend
}
type TCowAPIResult = {
	quote: Order;
	from: string;
	expiration: string;
	id: number;
}
type TCowResult = {
	result: TCowAPIResult | undefined,
	isLoading: boolean,
	error: Error | undefined
}

async function fetchCowQuote(url: string, data: {arg: unknown}): Promise<TCowAPIResult> {
	return (await axios.post(url, data.arg)).data;
}

export function useCowQuote(): [TCowResult, CallableFunction] {
	const {data, error, trigger, isMutating} = useSWRMutation('https://api.cow.fi/mainnet/api/v1/quote', fetchCowQuote);

	const	getQuote = useCallback(async (request: TCowRequest): Promise<void> => {
		console.warn('TIME TO FETCH SOME DATA');
		const	YEARN_APP_DATA = '0x2B8694ED30082129598720860E8E972F07AA10D9B81CAE16CA0E2CFB24743E24';
		const	quote: QuoteQuery = ({
			from: request.from, // receiver
			sellToken: request.sellToken, // token to spend
			buyToken: request.buyToken, // token to receive
			receiver: request.from, // always the same as from
			appData: YEARN_APP_DATA, // Always this
			kind: OrderKind.SELL, // always sell
			partiallyFillable: false, // always false
			validTo: 0,
			sellAmountBeforeFee: formatBN(request?.sellAmount || 0).toString() // amount to sell, in wei
		});

		const canExecuteFetch = !(isZeroAddress(quote.from) || isZeroAddress(quote.sellToken) || isZeroAddress(quote.buyToken)) && !formatBN(request?.sellAmount || 0).isZero();
		if (canExecuteFetch) {
			quote.validTo = Math.round((new Date().setMinutes(new Date().getMinutes() + 10) / 1000));
			trigger(quote, {revalidate: false});
		}
	}, [trigger]);

	return [
		useMemo((): TCowResult => ({
			result: data,
			isLoading: isMutating,
			error
		}), [data, error, isMutating]),
		getQuote
	];
}


// export function useExternalService<T, TReq>(type: TPossibleExternalServices, request: TCowRequest): TExternalService<T>['res'] {
// 	const	response = useCowQuote(request, type);
// 	const	response2 = usePortalsQuote(request, type);

// 	if (type === 'cowswap') {
// 		return response;
// 	} else if (type === 'portals') {
// 		return response2;
// 	}
// 	throw new Error('Function not implemented.');
// }

export function useExternalServiceQuote<T>({type, request}: TExternalService<T>['req']): TExternalService<T>['res'] {
	const {widoQuote, getWidoQuote} = useWido();
	const {portalsQuote, getPortalsQuote} = usePortals();
	const [cowQuote, getCowQuote] = useCowQuote();

	const quoteMapping = useMemo((): TDict<[TExternalService<T>['res'], CallableFunction]> => ({
		'wido': [widoQuote, getWidoQuote],
		'portals': [portalsQuote, getPortalsQuote],
		'cowswap': [cowQuote, getCowQuote]
	}), [cowQuote, getCowQuote, getPortalsQuote, getWidoQuote, portalsQuote, widoQuote]);

	const stringifiedRequest = JSON.stringify(request);
	useEffect((): void => {
		const	parsedRequest = JSON.parse(stringifiedRequest, (_key: string, value: T & { type?: string}): T | BigNumber => {
			if (value?.type === 'BigNumber') {
				return BigNumber.from(value);
			}
			return value;
		});

		const	[, fetcher] = quoteMapping[type];
		if (fetcher) {
			fetcher(parsedRequest);
		} else {
			throw new Error(`Unknown service ${type}`);
		}
	}, [quoteMapping, stringifiedRequest, type]);

	return quoteMapping[type][0];
}
