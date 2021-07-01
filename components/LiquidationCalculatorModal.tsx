import React, { FunctionComponent, useEffect, useState } from 'react'
import Modal from './Modal'
import { ElementTitle } from './styles'
import useMangoStore from '../stores/useMangoStore'
import useMarketList from '../hooks/useMarketList'
import Slider from './Slider'
import {
  ceilToDecimal,
} from '../utils/index'
import Button from './Button'
import Tooltip from './Tooltip'
import {
    floorToDecimal,
    tokenPrecision,
  } from '../utils/index'
import Input from './Input'

interface LiquidationCalculatorModalProps {
  onClose: () => void
  isOpen: boolean
  settleDeficit?: number
  tokenSymbol?: string
}
//TODO: somehow need to fix everything in place ui wise
interface CalculatorRow {
  price: number,
  assetName: string,
  deposit: number,
  borrow: number,
  net: number,
}
//TODO: rename
interface Calculator {
  rowData: CalculatorRow[],
  assets: number,
  liabilities: number,
  collateralRatio: number,
  leverage: number,
  borrowPct: number
}

const LiquidationCalculatorModal: FunctionComponent<LiquidationCalculatorModalProps> = ({
  isOpen,
  onClose = '',
}) => {
  const { symbols } = useMarketList()
  const selectedMangoGroup = useMangoStore((s) => s.selectedMangoGroup.current)
  const selectedMarginAccount = useMangoStore(
    (s) => s.selectedMarginAccount.current
  )
  const prices = useMangoStore((s) => s.selectedMangoGroup.prices)

  const [calcData, setCalcData] = useState<Calculator>();
  const [reload, setReload] = useState(false);

  useEffect(() => {
    const initRowData = Object.entries(symbols).map(([assetName], i) => { 
      return {
        price: prices[i],
        assetName: assetName,
        deposit: selectedMarginAccount
        ? floorToDecimal(
            selectedMarginAccount.getUiDeposit(
              selectedMangoGroup,
              i
            ),
            tokenPrecision[assetName]
          )
        : (0),
        borrow: selectedMarginAccount
        ? ceilToDecimal(selectedMarginAccount
            .getUiBorrow(selectedMangoGroup, i), tokenPrecision[assetName])
        : (0),
        net: selectedMarginAccount
        ?  (floorToDecimal(
          selectedMarginAccount.getUiDeposit(
            selectedMangoGroup,
            i
          ),
          tokenPrecision[assetName]
        ) - ceilToDecimal( selectedMarginAccount
            .getUiBorrow(selectedMangoGroup, i), tokenPrecision[assetName])) * prices[i]
        : (0),
        precision: tokenPrecision[assetName]
        }
      });
    const initCalcData = createCalculatorData(initRowData)
    setCalcData(initCalcData)
  }, [reload])

  const updateCalcData = (assetName, field) => e => { // useMemo? Also can i do this without the field 
      const updatedRowData = calcData.rowData.map(row => 
        {
          let cleanInput;
          if (!Number.isNaN(parseFloat(e.target.value))) {
            cleanInput = parseFloat(e.target.value)
          } else {
            cleanInput = e.target.value
          }

          let updatedNet: number;
          switch(field) {
            case 'borrow':
              updatedNet = (row.deposit - cleanInput) * row.price
              break
            case 'deposit':
              updatedNet = (cleanInput - row.borrow) * row.price
              break
            case 'price':
              updatedNet = (row.deposit - row.borrow) * cleanInput
              break
          }

          if (row.assetName == assetName){
            return {...row, [field]: cleanInput, net: updatedNet};
          }
          return row;
        });

        const updatedCalcData = createCalculatorData(updatedRowData);
        setCalcData(updatedCalcData);
}

const createCalculatorData = (rowData: CalculatorRow[]) => {

  const liabsVal = rowData.reduce((a, b) => a + (b['borrow'] || 0) * b['price'], 0);
  const assetsVal = rowData.reduce((a, b) => a + (b['deposit'] || 0)  * b['price'], 0);
  const collateralRatio =  assetsVal / liabsVal;
  const leverage = 1 / Math.max(0, collateralRatio - 1) || 0;

  // multiply by 0.99 and subtract 0.01 to account for rounding issues
  const maxBorrow = (assetsVal / 1.2) * 0.99 - 0.01

  const borrowPct = (liabsVal / maxBorrow) * 100

        return {
          rowData: rowData,
          assets: assetsVal,
          liabilities: liabsVal,
          collateralRatio: collateralRatio,
          leverage: leverage,
          borrowPct: borrowPct // TODO: change
        } as Calculator
}

//duplicate code
const getAccountStatusColor = (
  collateralRatio: number,
  isRisk?: boolean,
  isStatus?: boolean
) => {
  if (collateralRatio < 1.25) {
    return isRisk ? (
      <div className="text-th-red">High</div>
    ) : isStatus ? (
      'bg-th-red'
    ) : (
      'border-th-red text-th-red'
    )
  } else if (collateralRatio > 1.25 && collateralRatio < 1.5) {
    return isRisk ? (
      <div className="text-th-orange">Moderate</div>
    ) : isStatus ? (
      'bg-th-orange'
    ) : (
      'border-th-orange text-th-orange'
    )
  } else {
    return isRisk ? (
      <div className="text-th-green">Low</div>
    ) : isStatus ? (
      'bg-th-green'
    ) : (
      'border-th-green text-th-green'
    )
  }
}

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
        <Modal.Header>
            <ElementTitle>Liquidation Calculator</ElementTitle>
          </Modal.Header>
          {selectedMangoGroup && calcData ? (
          <table className={`min-w-full`}>
            <thead>
              <tr className={`text-center text-th-fgd-4 mb-2 text-xs`}>
                <th scope="col" className={`flex-auto font-normal text-center w-20`}>
                  Assets
                </th>
                <th
                  scope="col"
                  className={`flex-auto font-normal text-center px-2 w-30`}
                >
                  Price
                </th>
                <th
                  scope="col"
                  className={`flex-auto font-normal text-center px-2 w-30`}
                >
                  Deposits
                </th>
                <th
                  scope="col"
                  className={`flex-auto font-normal text-center px-2 w-30`}
                >
                  Borrows
                </th>
                <th
                  scope="col"
                  className="flex-auto font-normal flex justify-end items-center"
                >
                  Collateral Contribution
                </th>
              </tr>
            </thead>
            <tbody>
              {calcData.rowData.map((o) => (
                <tr key={o.assetName} className={`text-th-fgd-1`}>
                  <td className={`flex items-center py-2`}>
                    <img
                      alt=""
                      width="20"
                      height="20"
                      src={`/assets/icons/${o.assetName.toLowerCase()}.svg`}
                      className={`mr-2.5`}
                    />
                    <span>{o.assetName}</span>
                  </td>
                  <td className={`text-right px-2`}>
                  <Input
                    type="number"
                    min="0"
                    onChange={updateCalcData(o.assetName, 'price')} // reflection??
                    value={o.price}
                    className="rounded-r-none text-right"
                    wrapperClassName="w-full"
                  />
                  </td>
                  <td className={`text-right px-2`}>
                  <Input
                    type="number"
                    min="0"
                    onChange={updateCalcData(o.assetName, 'deposit')} // reflection??
                    value={o.deposit}
                    className="rounded-r-none text-right"
                    wrapperClassName="w-full text-right"
                  />
                  </td>
                  <td className={`text-right px-2`}>
                  <Input
                    type="number"
                    min="0"
                    onChange={updateCalcData(o.assetName, 'borrow')} // reflection??
                    value={o.borrow}
                    className="rounded-r-none text-right"
                    wrapperClassName="w-full"
                  />
                  </td>
                  <td className={`text-right`}>
                    { o.net ? o.net.toFixed(2) : 0}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      <div className={`row flex`}>
        <div className={`flex justify-center text-white mt-4 w-5/6`}>
          % of Maximum Borrow 
        </div>
        <div className={`flex justify-center text-white mt-4 w-1/6`}>
          Leverage
        </div>
        </div>

      <div className={`row flex mt-2`}>
        <div className={`ml-5 w-5/6`}>
          <div className={`pt-3 pb-4`}>
          <Slider
              disabled={true}
              value={calcData?.borrowPct}
              onChange={()=> {}}
              step={1}
              maxButtonTransition={false}
                  />
          </div>
        </div>
        <div className={`flex justify-center items-center w-1/6`}>  
          {calcData ? (
                <Tooltip content="Projected Leverage" className="py-1">
                  <span
                    className={`${getAccountStatusColor(
                      calcData?.collateralRatio
                    )} bg-th-bkg-1 border flex font-semibold h-10 items-center justify-center ml-2 rounded text-th-fgd-1 w-14`}
                  >
                    {calcData?.leverage < 5
                      ? calcData?.leverage.toFixed(2)
                      : '>5'}
                    x
                  </span>
                </Tooltip>
              ) : null}
        </div>
      </div>


      {/* <div className={`row flex mt-4`}>
        <div className={`row flex mt-4 w-4/6`}>
          <div className={`flex justify-center items-center mt-4 w-1/6`}>  
            <ElementTitle>Assets</ElementTitle>
          </div>
          <div className={`flex justify-center items-center mt-4 w-1/6`}>  
            <ElementTitle>{calcData?.assets.toFixed(3)}</ElementTitle>
          </div>
          <div className={`flex justify-center items-center mt-4 w-1/6`}>  
            <ElementTitle>Liabilities</ElementTitle>
          </div>
          <div className={`flex justify-center items-center mt-4 w-1/6`}>  
            <ElementTitle>{calcData?.liabilities.toFixed(3)}</ElementTitle>
          </div>
          <div className={`flex justify-center items-center text-white mt-4 w-2/6`}>  
            Current Collateral Ratio : {(calcData?.collateralRatio * 100).toFixed(3)}%
          </div>
        </div>
        <div className={`row flex mt-4 w-2/6 justify-right`}>
        {calcData ? (
                  <div
                    className={`${getAccountStatusColor(
                      calcData?.collateralRatio
                    )} bg-th-bkg-1 border flex font-semibold h-10 items-center justify-center ml-11 mt-6 rounded text-th-fgd-1 w-50`}
                  >
                    {calcData?.collateralRatio * 100 < 110
                      ? 'Liquidated'
                      : 'Not Liquidated'}
                  </div>
              ) : null}
        </div>
      </div> */}


        <div className={`flex justify-center items-center mt-4`}>
          {/* <Button
            onClick={() => setShowDepositModal(true)}
            className="w-1/2"
            disabled={!connected || loadingMarginAccount}
          >
            <span>Calculate MCR</span>
          </Button> */}
          <Button
            onClick={() => {
              setReload(!reload);
            }}
            className="ml-4 w-full"
            disabled={!selectedMarginAccount}
          >
            <span>Reset</span>
          </Button>
          </div>
    </Modal>
  )
}

export default React.memo(LiquidationCalculatorModal)
