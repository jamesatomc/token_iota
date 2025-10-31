"use client";

interface Pool {
  poolId: string;
  tokenXSymbol?: string;
  tokenYSymbol?: string;
  reserveX?: string;
  reserveY?: string;
  feeBps?: string;
}

interface Props {
  poolId: string;
  setPoolId: (id: string) => void;
  pools: Pool[];
  loading: boolean;
}

export default function PoolSelect({ poolId, setPoolId, pools, loading }: Props) {
  return (
    <div className="mb-4">
      <label className="block text-sm font-medium mb-2 text-gray-700">Select Pool</label>
      {loading ? (
        <div className="w-full px-4 py-3 rounded-lg border border-gray-300 bg-gray-50 text-gray-500 text-center">Loading pools...</div>
      ) : pools.length > 0 ? (
        <select
          value={poolId}
          onChange={(e) => setPoolId(e.target.value)}
          className="w-full px-4 py-3 rounded-lg border border-gray-300 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Select a pool...</option>
          {pools.map((pool) => (
            <option key={pool.poolId} value={pool.poolId}>
              {pool.tokenXSymbol}/{pool.tokenYSymbol} - {pool.poolId.slice(0, 8)}...{pool.poolId.slice(-6)} - Fee: {(parseInt(pool.feeBps || "0") / 100).toFixed(2)}%
            </option>
          ))}
        </select>
      ) : (
        <div className="w-full px-4 py-3 rounded-lg border border-gray-300 bg-gray-50 text-gray-700 text-sm">
          ⚠️ No pools found. Please create a pool first.
        </div>
      )}
    </div>
  );
}
