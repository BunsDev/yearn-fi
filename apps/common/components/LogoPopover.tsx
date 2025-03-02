import {cloneElement, useState} from 'react';
import Link from 'next/link';
import {useRouter} from 'next/router';
import {Popover, Transition} from '@headlessui/react';
import {VaultsHeader} from '@vaults/components/header/VaultsHeader';
import {VaultsV3Header} from '@vaults-v3/components/header/VaultsHeader';
import {V3Logo} from '@vaults-v3/Mark';
import {VeYfiHeader} from '@veYFI/components/header/VeYfiHeader';
import {cl} from '@yearn-finance/web-lib/utils/cl';
import {useCurrentApp} from '@common/hooks/useCurrentApp';
import {LogoYearn} from '@common/icons/LogoYearn';
import {YBribeHeader} from '@yBribe/components/header/YBribeHeader';
import {YCrvHeader} from '@yCRV/components/header/YCrvHeader';

import {APPS} from './Apps';
import {MotionDiv} from './MotionDiv';

import type {ReactElement} from 'react';

function Logo(): ReactElement {
	const {pathname} = useRouter();

	return (
		<>
			<YCrvHeader pathname={pathname} />
			<VaultsHeader pathname={pathname} />
			<VeYfiHeader pathname={pathname} />
			<YBribeHeader pathname={pathname} />
			<VaultsV3Header pathname={pathname} />
			<MotionDiv
				name={'yearn'}
				animate={pathname === '/' ? 'enter' : 'exit'}>
				<LogoYearn
					className={'size-8'}
					back={'text-neutral-900'}
					front={'text-neutral-0'}
				/>
			</MotionDiv>
		</>
	);
}

export function LogoPopover(): ReactElement {
	const [isShowing, set_isShowing] = useState(false);
	const router = useRouter();
	const {name: currentAppName} = useCurrentApp(router);

	return (
		<>
			<Popover
				onMouseEnter={(): void => set_isShowing(true)}
				onMouseLeave={(): void => set_isShowing(false)}>
				<div
					onClick={(): void => set_isShowing(false)}
					onMouseEnter={(): void => set_isShowing(false)}
					className={cl(
						'fixed inset-0 bg-black backdrop-blur-sm transition-opacity',
						!isShowing ? 'opacity-0 pointer-events-none' : 'opacity-0 pointer-events-auto'
					)}
				/>
				<Popover.Button className={'z-20 flex items-center'}>
					<Link href={'/'}>
						<span className={'sr-only'}>{'Back to home'}</span>
						<Logo />
					</Link>
				</Popover.Button>

				<Transition.Root show={isShowing}>
					<Transition.Child
						as={'div'}
						enter={'transition ease-out duration-200'}
						enterFrom={'opacity-0 translate-y-1'}
						enterTo={'opacity-100 translate-y-0'}
						leave={'transition ease-in duration-150'}
						leaveFrom={'opacity-100 translate-y-0'}
						leaveTo={'opacity-0 translate-y-1'}
						className={'relative z-[9999999]'}>
						<Popover.Panel
							className={'absolute left-1/2 z-20 w-80 -translate-x-1/2 px-4 pt-6 sm:px-0 md:w-[800px]'}>
							<div className={'overflow-hidden pt-4 shadow-xl'}>
								<div
									className={cl(
										'relative grid grid-cols-2 gap-2 border p-6 md:grid-cols-5',
										currentAppName === 'V3'
											? 'bg-[#000520] border-neutral-200/60 rounded-sm'
											: 'bg-[#F4F4F4] dark:bg-[#282828] border-transparent'
									)}>
									<div className={'col-span-3 grid grid-cols-2 gap-2 md:grid-cols-3'}>
										{[...Object.values(APPS)]
											.filter(({isDisabled}): boolean => !isDisabled)
											.filter(({name}): boolean => name !== 'V3')
											.map(({name, href, icon}): ReactElement => {
												return (
													<Link
														prefetch={false}
														key={name}
														href={href}
														onClick={(): void => set_isShowing(false)}>
														<div
															onClick={(): void => set_isShowing(false)}
															className={cl(
																'flex cursor-pointer border flex-col items-center justify-center transition-colors p-4',
																currentAppName !== 'V3'
																	? 'bg-[#EBEBEB] border-transparent hover:bg-[#c3c3c380] dark:bg-[#0C0C0C] hover:dark:bg-[#3d3d3d80]'
																	: 'bg-[#000520] hover:bg-[#33374d80] border-[#151C40]'
															)}>
															<div>{cloneElement(icon, {className: 'w-8 h-8'})}</div>
															<div className={'pt-2 text-center'}>
																<b className={'text-base'}>{name}</b>
															</div>
														</div>
													</Link>
												);
											})}
									</div>
									<div className={'col-span-2 grid grid-cols-2 gap-2 md:grid-cols-3'}>
										<Link
											prefetch={false}
											key={currentAppName}
											href={'/v3'}
											className={'col-span-3 row-span-2'}
											onClick={(): void => set_isShowing(false)}>
											<div
												className={cl(
													'relative flex h-full w-full cursor-pointer flex-col items-center justify-center transition-all rounded-sm p-4',
													currentAppName !== 'V3'
														? 'bg-[#EBEBEB] hover:bg-[#c3c3c380] dark:bg-[#0C0C0C] hover:dark:bg-[#3d3d3d80]'
														: 'bg-[#010A3B] hover:brightness-125'
												)}>
												<div className={'z-10 flex w-full flex-col items-center'}>
													<V3Logo className={'h-20'} />
													<div className={'-mb-2 pt-4 text-center'}>
														<p
															className={cl(
																'font-bold text-black dark:text-white text-sm',
																'whitespace-break-spaces'
															)}>
															{`Discover\nBrand New Vaults`}
														</p>
													</div>
												</div>
											</div>
										</Link>
									</div>
								</div>
							</div>
						</Popover.Panel>
					</Transition.Child>
				</Transition.Root>
			</Popover>
		</>
	);
}
