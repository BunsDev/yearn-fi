import {createContext, useCallback, useContext, useEffect, useMemo, useState} from 'react';
import {useWeb3} from '@builtbymom/web3/contexts/useWeb3';
import {formatPercent, isZero, toAddress, toBigInt, toNormalizedBN} from '@builtbymom/web3/utils';
import {defaultTxStatus} from '@builtbymom/web3/utils/wagmi';
import {useAsync, useIntervalEffect} from '@react-hookz/web';
import {readContract} from '@wagmi/core';
import {yToast} from '@yearn-finance/web-lib/components/yToast';
import {useAddToken} from '@yearn-finance/web-lib/hooks/useAddToken';
import {useDismissToasts} from '@yearn-finance/web-lib/hooks/useDismissToasts';
import {VAULT_ABI} from '@yearn-finance/web-lib/utils/abi/vault.abi';
import {
	LPYCRV_TOKEN_ADDRESS,
	LPYCRV_V2_TOKEN_ADDRESS,
	MAX_UINT_256,
	STYCRV_TOKEN_ADDRESS,
	YCRV_CURVE_POOL_ADDRESS,
	YCRV_CURVE_POOL_V2_ADDRESS,
	YCRV_TOKEN_ADDRESS,
	ZAP_YEARN_VE_CRV_ADDRESS
} from '@yearn-finance/web-lib/utils/constants';
import {useWallet} from '@common/contexts/useWallet';
import {useYearn} from '@common/contexts/useYearn';
import {allowanceKey, getAmountWithSlippage, getVaultAPR} from '@common/utils';
import {approveERC20, deposit} from '@common/utils/actions';
import {YCRV_SUPPORTED_NETWORK} from '@yCRV/constants/index';
import {ZAP_OPTIONS_FROM, ZAP_OPTIONS_TO} from '@yCRV/constants/tokens';
import {useYCRV} from '@yCRV/contexts/useYCRV';
import {ZAP_CRV_ABI} from '@yCRV/utils/abi/zapCRV.abi';
import {zapCRV} from '@yCRV/utils/actions';

import type {ReactElement} from 'react';
import type {TAddress, TNormalizedBN} from '@builtbymom/web3/types';
import type {TDropdownOption} from '@common/types/types';

type TCardTransactor = {
	selectedOptionFrom: TDropdownOption;
	selectedOptionTo: TDropdownOption;
	amount: TNormalizedBN;
	txStatusApprove: typeof defaultTxStatus;
	txStatusZap: typeof defaultTxStatus;
	allowanceFrom: bigint;
	fromVaultAPY: string;
	toVaultAPY: string;
	expectedOutWithSlippage: number;
	set_selectedOptionFrom: (option: TDropdownOption) => void;
	set_selectedOptionTo: (option: TDropdownOption) => void;
	set_amount: (amount: TNormalizedBN) => void;
	set_hasTypedSomething: (hasTypedSomething: boolean) => void;
	onApproveFrom: () => Promise<void>;
	onIncreaseCRVAllowance: () => Promise<void>;
	onZap: () => Promise<void>;
};

const CardTransactorContext = createContext<TCardTransactor>({
	selectedOptionFrom: ZAP_OPTIONS_FROM[0],
	selectedOptionTo: ZAP_OPTIONS_TO[0],
	amount: toNormalizedBN(0),
	txStatusApprove: defaultTxStatus,
	txStatusZap: defaultTxStatus,
	allowanceFrom: 0n,
	fromVaultAPY: '',
	toVaultAPY: '',
	expectedOutWithSlippage: 0,
	set_selectedOptionFrom: (): void => undefined,
	set_selectedOptionTo: (): void => undefined,
	set_amount: (): void => undefined,
	set_hasTypedSomething: (): void => undefined,
	onApproveFrom: async (): Promise<void> => undefined,
	onZap: async (): Promise<void> => undefined,
	onIncreaseCRVAllowance: async (): Promise<void> => undefined
});

export function CardTransactorContextApp({
	defaultOptionFrom = ZAP_OPTIONS_FROM[0],
	defaultOptionTo = ZAP_OPTIONS_TO[0],
	children = <div />
}): ReactElement {
	const {provider, isActive, address} = useWeb3();
	const {styCRVAPY, allowances, refetchAllowances, slippage} = useYCRV();
	const {getBalance, refresh} = useWallet();
	const {vaults} = useYearn();
	const [txStatusApprove, set_txStatusApprove] = useState(defaultTxStatus);
	const [txStatusZap, set_txStatusZap] = useState(defaultTxStatus);
	const [selectedOptionFrom, set_selectedOptionFrom] = useState(defaultOptionFrom);
	const [selectedOptionTo, set_selectedOptionTo] = useState(defaultOptionTo);
	const [amount, set_amount] = useState<TNormalizedBN>(toNormalizedBN(0));
	const [hasTypedSomething, set_hasTypedSomething] = useState(false);
	const addToken = useAddToken();
	const {dismissAllToasts} = useDismissToasts();
	const {toast} = yToast();

	/* 🔵 - Yearn Finance ******************************************************
	 ** SWR hook to get the expected out for a given in/out pair with a specific
	 ** amount. This hook is called every 10s or when amount/in or out changes.
	 ** Calls the expectedOutFetcher callback.
	 **************************************************************************/
	const [{result: expectedOut}, {execute: fetchExpectedOut}] = useAsync(async (): Promise<bigint> => {
		return expectedOutFetcher([selectedOptionFrom.value, selectedOptionTo.value, amount.raw]);
	}, 0n);

	useIntervalEffect(async (): Promise<bigint> => fetchExpectedOut(), 30000);

	useEffect((): void => {
		fetchExpectedOut();
	}, [selectedOptionFrom.value, selectedOptionTo.value, amount.raw, fetchExpectedOut]);

	/* 🔵 - Yearn Finance ******************************************************
	 ** useEffect to set the amount to the max amount of the selected token once
	 ** the wallet is connected, or to 0 if the wallet is disconnected.
	 **************************************************************************/
	useEffect((): void => {
		if (isActive && isZero(amount.raw) && !hasTypedSomething) {
			set_amount(
				toNormalizedBN(
					getBalance({address: selectedOptionFrom.value, chainID: selectedOptionFrom.chainID})?.raw
				)
			);
		} else if (!isActive && amount.raw > 0n) {
			set_amount(toNormalizedBN(0));
			set_hasTypedSomething(false);
			fetchExpectedOut();
		}
	}, [isActive, selectedOptionFrom, amount.raw, hasTypedSomething, getBalance, fetchExpectedOut]);

	/* 🔵 - Yearn Finance ******************************************************
	 ** Perform a smartContract call to the ZAP contract to get the expected
	 ** out for a given in/out pair with a specific amount. This callback is
	 ** called every 10s or when amount/in or out changes.
	 **************************************************************************/
	const expectedOutFetcher = useCallback(async (args: [TAddress, TAddress, bigint]): Promise<bigint> => {
		const [_inputToken, _outputToken, _amountIn] = args;
		if (isZero(_amountIn)) {
			return 0n;
		}

		try {
			if (_inputToken === YCRV_CURVE_POOL_ADDRESS) {
				const pps = await readContract({
					address: LPYCRV_TOKEN_ADDRESS,
					chainId: YCRV_SUPPORTED_NETWORK,
					abi: VAULT_ABI,
					functionName: 'pricePerShare'
				});
				const _expectedOut = (_amountIn * pps) / toBigInt(1e18);
				return _expectedOut;
			}
			if (_inputToken === YCRV_CURVE_POOL_V2_ADDRESS) {
				const pps = await readContract({
					address: LPYCRV_V2_TOKEN_ADDRESS,
					chainId: YCRV_SUPPORTED_NETWORK,
					abi: VAULT_ABI,
					functionName: 'pricePerShare'
				});
				const _expectedOut = (_amountIn * pps) / toBigInt(1e18);
				return _expectedOut;
			}
			const _expectedOut = await readContract({
				address: ZAP_YEARN_VE_CRV_ADDRESS,
				chainId: YCRV_SUPPORTED_NETWORK,
				abi: ZAP_CRV_ABI,
				functionName: 'calc_expected_out',
				args: [_inputToken, _outputToken, _amountIn]
			});
			return _expectedOut;
		} catch (error) {
			return 0n;
		}
	}, []);

	/* 🔵 - Yearn Finance ******************************************************
	 ** Approve the spending of token A by the corresponding ZAP contract to
	 ** perform the swap.
	 **************************************************************************/
	const onApprove = useCallback(async (): Promise<void> => {
		const result = await approveERC20({
			connector: provider,
			chainID: selectedOptionFrom.chainID,
			contractAddress: selectedOptionFrom.value,
			spenderAddress: selectedOptionFrom.zapVia,
			amount: MAX_UINT_256,
			statusHandler: set_txStatusApprove
		});
		if (result.isSuccessful) {
			await Promise.all([refetchAllowances(), refresh()]);
		}
	}, [provider, selectedOptionFrom, refetchAllowances, refresh]);

	/* 🔵 - Yearn Finance ******************************************************
	 ** CRV token require the allowance to be reset to 0 before being able to
	 ** increase it. This function is called when the user wants to increase the
	 ** allowance of the CRV token.
	 **************************************************************************/
	const onIncreaseCRVAllowance = useCallback(async (): Promise<void> => {
		const resultReset = await approveERC20({
			connector: provider,
			chainID: selectedOptionFrom.chainID,
			contractAddress: selectedOptionFrom.value,
			spenderAddress: selectedOptionFrom.zapVia,
			amount: 0n,
			statusHandler: set_txStatusApprove
		});
		if (resultReset.isSuccessful) {
			const result = await approveERC20({
				connector: provider,
				chainID: selectedOptionFrom.chainID,
				contractAddress: selectedOptionFrom.value,
				spenderAddress: selectedOptionFrom.zapVia,
				amount: MAX_UINT_256,
				statusHandler: set_txStatusApprove
			});
			if (result.isSuccessful) {
				await refresh();
			}
		}
	}, [provider, refresh, selectedOptionFrom]);

	/* 🔵 - Yearn Finance ******************************************************
	 ** Execute a zap using the ZAP contract to migrate from a token A to a
	 ** supported token B.
	 **************************************************************************/
	const onZap = useCallback(async (): Promise<void> => {
		dismissAllToasts();
		const addToMetamaskToast = {
			type: 'info' as const,
			content: `Add ${selectedOptionTo.symbol} to Metamask?`,
			duration: Infinity,
			cta: {
				label: 'Add +',
				onClick: (): void =>
					addToken({
						address: selectedOptionTo.value,
						symbol: selectedOptionTo.symbol,
						decimals: selectedOptionTo.decimals,
						image: selectedOptionTo.icon?.props.src
					})
			}
		};

		if (
			selectedOptionFrom.zapVia === LPYCRV_TOKEN_ADDRESS ||
			selectedOptionFrom.zapVia === LPYCRV_V2_TOKEN_ADDRESS
		) {
			// Direct deposit to vault from crv/yCRV Curve LP Token to lp-yCRV Vault
			// This is valid for v1 and v2
			const result = await deposit({
				connector: provider,
				chainID: selectedOptionFrom.chainID,
				contractAddress: selectedOptionTo.value,
				amount: amount.raw,
				statusHandler: set_txStatusZap
			});
			if (result.isSuccessful) {
				set_amount(toNormalizedBN(0));
				await refresh();
				toast(addToMetamaskToast);
			}
		} else {
			// Zap in
			const result = await zapCRV({
				connector: provider,
				chainID: selectedOptionFrom.chainID,
				contractAddress: ZAP_YEARN_VE_CRV_ADDRESS,
				inputToken: selectedOptionFrom.value, //_input_token
				outputToken: selectedOptionTo.value, //_output_token
				amount: amount.raw, //amount_in
				minAmount: toBigInt(expectedOut), //_min_out
				slippage: selectedOptionTo.value === YCRV_TOKEN_ADDRESS ? 0n : toBigInt(slippage * 100), // Default to 0.6
				statusHandler: set_txStatusZap
			});
			if (result.isSuccessful) {
				set_amount(toNormalizedBN(0));
				await refresh();
				toast(addToMetamaskToast);
			}
		}
	}, [
		addToken,
		amount.raw,
		dismissAllToasts,
		expectedOut,
		provider,
		refresh,
		selectedOptionFrom,
		selectedOptionTo,
		slippage,
		toast
	]);

	/* 🔵 - Yearn Finance ******************************************************
	 ** Set of memorized values to limit the number of re-rendering of the
	 ** component.
	 **************************************************************************/
	const fromVaultAPY = useMemo((): string => {
		if (toAddress(selectedOptionFrom.value) === STYCRV_TOKEN_ADDRESS) {
			return `APY ${formatPercent(styCRVAPY)}`;
		}
		return getVaultAPR(vaults, selectedOptionFrom.value);
	}, [vaults, selectedOptionFrom, styCRVAPY]);

	const toVaultAPY = useMemo((): string => {
		if (toAddress(selectedOptionTo.value) === STYCRV_TOKEN_ADDRESS) {
			return `APY ${formatPercent(styCRVAPY)}`;
		}
		return getVaultAPR(vaults, selectedOptionTo.value);
	}, [vaults, selectedOptionTo, styCRVAPY]);

	const expectedOutWithSlippage = useMemo(
		(): number =>
			getAmountWithSlippage(selectedOptionFrom.value, selectedOptionTo.value, toBigInt(expectedOut), slippage),
		[expectedOut, selectedOptionFrom.value, selectedOptionTo.value, slippage]
	);

	const allowanceFrom = useMemo((): bigint => {
		return toBigInt(
			allowances?.[
				allowanceKey(
					1,
					toAddress(selectedOptionFrom.value),
					toAddress(selectedOptionFrom.zapVia),
					toAddress(address)
				)
			]
		);
	}, [allowances, selectedOptionFrom.value, selectedOptionFrom.zapVia, address]);

	return (
		<CardTransactorContext.Provider
			value={{
				selectedOptionFrom,
				selectedOptionTo,
				amount,
				txStatusApprove,
				txStatusZap,
				allowanceFrom,
				fromVaultAPY,
				toVaultAPY,
				expectedOutWithSlippage,
				set_selectedOptionFrom,
				set_selectedOptionTo,
				set_amount,
				set_hasTypedSomething,
				onApproveFrom: onApprove,
				onIncreaseCRVAllowance,
				onZap
			}}>
			{children}
		</CardTransactorContext.Provider>
	);
}

export const useCardTransactor = (): TCardTransactor => useContext(CardTransactorContext);
