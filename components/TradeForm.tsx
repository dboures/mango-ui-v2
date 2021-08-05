import { useState, useEffect, useRef, useMemo } from 'react'
import { ExclamationCircleIcon } from '@heroicons/react/outline'
import styled from '@emotion/styled'
import useMarket from '../hooks/useMarket'
import useIpAddress from '../hooks/useIpAddress'
import useConnection from '../hooks/useConnection'
import useMarketList from '../hooks/useMarketList'
import { PublicKey } from '@solana/web3.js'
import { IDS } from '@blockworks-foundation/mango-client'
import { notify } from '../utils/notifications'
import { placeAndSettle } from '../utils/mango'
import { calculateMarketPrice, getDecimalCount } from '../utils'
import FloatingElement from './FloatingElement'
import { floorToDecimal } from '../utils/index'
import useMangoStore from '../stores/useMangoStore'
import Button from './Button'
import TradeType from './TradeType'
import Input from './Input'
import Switch from './Switch'
import LeverageSlider from './LeverageSlider'

const StyledRightInput = styled(Input)`
  border-left: 1px solid transparent;
`

export default function TradeForm() {
  const { baseCurrency, quoteCurrency, market, marketAddress } = useMarket()
  const set = useMangoStore((s) => s.set)
  const connected = useMangoStore((s) => s.wallet.connected)
  const actions = useMangoStore((s) => s.actions)
  const { connection, cluster } = useConnection()
  const { side, baseSize, quoteSize, price, tradeType } = useMangoStore(
    (s) => s.tradeForm
  )
  const selectedMarginAccount = useMangoStore(
    (s) => s.selectedMarginAccount.current
  )
  const selectedMangoGroup = useMangoStore((s) => s.selectedMangoGroup.current)
  const prices = useMangoStore((s) => s.selectedMangoGroup.prices)
  const { getTokenIndex, symbols } = useMarketList()
  const currentTokenIndex = useMemo(
    () => getTokenIndex(symbols[baseCurrency]),
    [baseCurrency]
  )
  const { ipAllowed } = useIpAddress()
  const [invalidInputMessage, setInvalidInputMessage] = useState('')
  const [leverageNotification, setLeverageNotification] = useState('')
  const [postOnly, setPostOnly] = useState(false)
  const [ioc, setIoc] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [maxButtonTransition, setMaxButtonTransition] = useState(false)
  const [thisAssetDeposit, setThisAssetDeposit] = useState(0)
  const [usdcDeposit, setUsdcDeposit] = useState(0)
  const [liabsVal, setLiabsVal] = useState(0)
  const [accountEquity, setAccountEquity] = useState(0)
  const [leveragePct, setLeveragePct] = useState(0)
  const orderBookRef = useRef(useMangoStore.getState().selectedMarket.orderBook)
  const orderbook = orderBookRef.current[0]

  useEffect(
    () =>
      useMangoStore.subscribe(
        (orderBook) => (orderBookRef.current = orderBook as any[]),
        (state) => state.selectedMarket.orderBook
      ),
    []
  )

  useEffect(() => {
    if (connected) {
      const TAD = selectedMarginAccount?.getUiDeposit(
        selectedMangoGroup,
        currentTokenIndex
      )
      setThisAssetDeposit(TAD)
      const USDCD = selectedMarginAccount?.getUiDeposit(
        selectedMangoGroup,
        getTokenIndex(symbols['USDC'])
      )
      setUsdcDeposit(USDCD)
    }
  }, [selectedMarginAccount, selectedMangoGroup, connected, currentTokenIndex])

  useEffect(() => {
    if (connected) {
      const LV = selectedMarginAccount?.getLiabsVal(selectedMangoGroup, prices)
      setLiabsVal(LV)
      const AE = selectedMarginAccount?.computeValue(selectedMangoGroup, prices)
      setAccountEquity(AE)
    }
  }, [selectedMarginAccount, selectedMangoGroup, prices, connected])

  useEffect(() => {
    setBaseSize('')
    setInvalidInputMessage('')
    setPrice('')
    setQuoteSize('')
  }, [baseCurrency])

  useEffect(() => {
    onSetBaseSize(baseSize)
  }, [baseSize])

  useEffect(() => {
    if (market && baseSize >= market.minOrderSize) {
      setInvalidInputMessage('')
    }
  }, [baseSize])

  useEffect(() => {
    if (leveragePct) {
      const newQuoteSize = leverageQuoteCalc(leveragePct)
      onSetQuoteSize(newQuoteSize)
    } else {
      onSetPrice(price)
    }
  }, [price, leveragePct, side])

  const setSide = (side) => {
    set((s) => {
      s.tradeForm.side = side
    })
  }

  const setBaseSize = (baseSize) =>
    set((s) => {
      if (!Number.isNaN(parseFloat(baseSize))) {
        s.tradeForm.baseSize = parseFloat(baseSize)
      } else {
        s.tradeForm.baseSize = baseSize
      }
    })

  const setQuoteSize = (quoteSize) =>
    set((s) => {
      if (!Number.isNaN(parseFloat(quoteSize))) {
        s.tradeForm.quoteSize = parseFloat(quoteSize)
      } else {
        s.tradeForm.quoteSize = quoteSize
      }
    })

  const setPrice = (price) =>
    set((s) => {
      if (!Number.isNaN(parseFloat(price))) {
        s.tradeForm.price = parseFloat(price)
      } else {
        s.tradeForm.price = price
      }
    })

  const setTradeType = (type) =>
    set((s) => {
      s.tradeForm.tradeType = type
    })

  const leverageQuoteCalc = (leveragePct) => {
    //get limit price or use markprice
    const usePrice = Number(price) || markPrice
    //calc current & available margin
    const maxMarginUSD = accountEquity * 5
    const availableMargin = maxMarginUSD - liabsVal
    // calc trade value as percent of available margin
    let maxTradeVal
    if (side == 'sell') {
      maxTradeVal = availableMargin + thisAssetDeposit * usePrice
    } else {
      maxTradeVal = availableMargin + usdcDeposit
    }
    const newQuoteSize = (maxTradeVal * leveragePct) / 100
    if (newQuoteSize < 0) {
      setLeverageNotification(
        `You have exceeded 5x leverage. Please reduce account leverage before ${side}ing`
      )
    } else {
      setLeverageNotification('')
    }
    return newQuoteSize > 0 ? floorToDecimal(newQuoteSize, 2) : 0
  }

  const markPriceRef = useRef(useMangoStore.getState().selectedMarket.markPrice)
  const markPrice = markPriceRef.current
  useEffect(
    () =>
      useMangoStore.subscribe(
        (markPrice) => (markPriceRef.current = markPrice as number),
        (state) => state.selectedMarket.markPrice
      ),
    []
  )

  const sizeDecimalCount =
    market?.minOrderSize && getDecimalCount(market.minOrderSize)
  // const priceDecimalCount = market?.tickSize && getDecimalCount(market.tickSize)

  const onSetPrice = (price: number | '') => {
    setPrice(price)
    if (!price) return
    if (quoteSize) {
      onSetQuoteSize(quoteSize)
    }
  }

  const onSetBaseSize = (baseSize: number | '') => {
    const { price } = useMangoStore.getState().tradeForm
    setBaseSize(baseSize)
    if (!baseSize) {
      setQuoteSize('')
      return
    }
    const usePrice = Number(price) || markPrice
    if (!usePrice) {
      setQuoteSize('')
      return
    }
    const rawQuoteSize = baseSize * usePrice
    const quoteSize = baseSize && floorToDecimal(rawQuoteSize, 2)
    setQuoteSize(quoteSize)
  }

  const onSetQuoteSize = (quoteSize: number | '') => {
    setQuoteSize(quoteSize)
    if (!quoteSize) {
      setBaseSize('')
      return
    }

    if (!Number(price) && tradeType === 'Limit') {
      setBaseSize('')
      return
    }
    const usePrice = Number(price) || markPrice
    const rawBaseSize = quoteSize / usePrice
    const baseSize = quoteSize && floorToDecimal(rawBaseSize, sizeDecimalCount)
    setBaseSize(baseSize)
  }

  const postOnChange = (checked) => {
    if (checked) {
      setIoc(false)
    }
    setPostOnly(checked)
  }
  const iocOnChange = (checked) => {
    if (checked) {
      setPostOnly(false)
    }
    setIoc(checked)
  }

  const onChangeSlider = (leveragePct) => {
    setLeveragePct(leveragePct)
  }

  async function onSubmit() {
    if (!price && tradeType === 'Limit') {
      console.warn('Missing price')
      notify({
        message: 'Missing price',
        type: 'error',
      })
      return
    } else if (!baseSize) {
      console.warn('Missing size')
      notify({
        message: 'Missing size',
        type: 'error',
      })
      return
    }

    const marginAccount = useMangoStore.getState().selectedMarginAccount.current
    const mangoGroup = useMangoStore.getState().selectedMangoGroup.current
    const wallet = useMangoStore.getState().wallet.current

    if (!mangoGroup || !marketAddress || !marginAccount || !market) return
    setSubmitting(true)

    try {
      let calculatedPrice
      if (tradeType === 'Market') {
        calculatedPrice =
          side === 'buy'
            ? calculateMarketPrice(orderbook.asks, baseSize, side)
            : calculateMarketPrice(orderbook.bids, baseSize, side)
      }

      await placeAndSettle(
        connection,
        new PublicKey(IDS[cluster].mango_program_id),
        mangoGroup,
        marginAccount,
        market,
        wallet,
        side,
        calculatedPrice ?? price,
        baseSize,
        ioc ? 'ioc' : postOnly ? 'postOnly' : 'limit'
      )
      console.log('Successfully placed trade!')

      setPrice('')
      onSetBaseSize('')
      actions.fetchMarginAccounts()
    } catch (e) {
      notify({
        message: 'Error placing order',
        description: e.message,
        txid: e.txid,
        type: 'error',
      })
    } finally {
      setSubmitting(false)
    }
  }

  const handleTradeTypeChange = (tradeType) => {
    setTradeType(tradeType)
    if (tradeType === 'Market') {
      setIoc(true)
      setPrice('')
    } else {
      const limitPrice =
        side === 'buy' ? orderbook.asks[0][0] : orderbook.bids[0][0]
      setPrice(limitPrice)
      setIoc(false)
    }
  }

  const validateInput = () => {
    if (market && baseSize < market.minOrderSize) {
      setInvalidInputMessage(
        `Size must be greater than or equal to ${market.minOrderSize} ${baseCurrency}`
      )
    }
  }

  const disabledTradeButton =
    (!price && tradeType === 'Limit') ||
    !baseSize ||
    (market && baseSize < market.minOrderSize) ||
    !connected ||
    submitting

  return (
    <FloatingElement showConnect>
      <div>
        <div className={`flex mb-4 text-base text-th-fgd-4`}>
        <button
            onClick={() => setSide('buy')}
            className={`flex-1 outline-none focus:outline-none`}
          >
            <div
              className={`border-b-2 border-th-bkg-3 hover:text-th-green pb-2 transition-colors duration-500
                ${
                  side === 'buy' &&
                  `text-th-green hover:text-th-green border-b-2 border-th-green`
                }`}
            >
              Buy
            </div>
          </button>
          <button
            onClick={() => setSide('sell')}
            className={`flex-1 outline-none focus:outline-none`}
          >
            <div
              className={`border-b-2 border-th-bkg-3 hover:text-th-red pb-2 transition-colors duration-500
                ${
                  side === 'sell' &&
                  `text-th-red hover:text-th-red border-b-2 border-th-red`
                }
              `}
            >
              Sell
            </div>
          </button>
        </div>
        <Input.Group className="mt-2">
          <Input
            type="number"
            min="0"
            step={market?.tickSize || 1}
            onChange={(e) => onSetPrice(e.target.value)}
            value={price}
            disabled={tradeType === 'Market'}
            prefix={'Price'}
            suffix={quoteCurrency}
            className="rounded-r-none"
            wrapperClassName="w-3/5"
          />
          <TradeType
            onChange={handleTradeTypeChange}
            value={tradeType}
            className="hover:border-th-primary flex-grow"
          />
        </Input.Group>

        <Input.Group className="mt-4">
          <Input
            type="number"
            min="0"
            step={market?.minOrderSize || 1}
            onBlur={() => validateInput()}
            onChange={(e) => onSetBaseSize(e.target.value)}
            value={baseSize}
            className="rounded-r-none"
            wrapperClassName="w-3/5"
            prefix={'Size'}
            suffix={baseCurrency}
          />
          <StyledRightInput
            type="number"
            min="0"
            step={market?.minOrderSize || 1}
            onBlur={() => validateInput()}
            onChange={(e) => onSetQuoteSize(e.target.value)}
            value={quoteSize}
            className="rounded-l-none"
            wrapperClassName="w-2/5"
            suffix={quoteCurrency}
          />
        </Input.Group>
        {invalidInputMessage ? (
          <div className="flex items-center pt-1.5 text-th-red">
            <ExclamationCircleIcon className="h-4 w-4 mr-1.5" />
            {invalidInputMessage}
          </div>
        ) : null}
        {tradeType !== 'Market' ? (
          <div className="flex items-center mt-4">
            <Switch checked={postOnly} onChange={postOnChange}>
              POST
            </Switch>
            <div className="ml-4">
              <Switch checked={ioc} onChange={iocOnChange}>
                IOC
              </Switch>
            </div>
          </div>
        ) : null}
      </div>
      <div className={'pt-4'}>
        <LeverageSlider
          value={leveragePct}
          onChange={(v) => onChangeSlider(v)}
          step={1}
          maxButtonTransition={maxButtonTransition}
        />
      </div>
      {leverageNotification ? (
        <div className={`flex items-left pt-2 pt-1.5 text-th-primary`}>
          {leverageNotification}
        </div>
      ) : null}
      <div className={`flex pt-6`}>
        {ipAllowed ? (
          connected ? (
            side === 'buy' ? (
              <Button
                disabled={disabledTradeButton}
                onClick={onSubmit}
                className={`${
                  !disabledTradeButton &&
                  'border-th-green hover:border-th-green-dark'
                } text-th-green hover:text-th-fgd-1 hover:bg-th-green-dark flex-grow`}
              >
                {`${
                  baseSize > 0 ? 'Buy ' + baseSize : 'Buy'
                } ${baseCurrency}`}
              </Button>
            ) : (
              <Button
                disabled={disabledTradeButton}
                onClick={onSubmit}
                className={`${
                  !disabledTradeButton &&
                  'border-th-red hover:border-th-red-dark'
                } text-th-red hover:text-th-fgd-1 hover:bg-th-red-dark flex-grow`}
              >
                {`${
                  baseSize > 0 ? 'Sell ' + baseSize : 'Sell'
                } ${baseCurrency}`}
              </Button>
            )
          ) : (
            <Button
              disabled={disabledTradeButton}
              onClick={onSubmit}
              className={`${
                !disabledTradeButton && 'border-th-red hover:border-th-red-dark'
              } text-th-red hover:text-th-fgd-1 hover:bg-th-red-dark flex-grow`}
            >
              {`${
                baseSize > 0
                  ? 'Sell ' + baseSize
                  : 'Set SELL bid >= ' + market?.minOrderSize
              } ${baseCurrency}`}
            </Button>
          )
        ) : (
          <Button disabled className="flex-grow">
            <span className="text-lg font-light">Country Not Allowed</span>
          </Button>
        )}
      </div>
    </FloatingElement>
  )
}
