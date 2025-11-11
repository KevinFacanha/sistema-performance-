import { Store } from 'lucide-react';

interface MarketplaceFilterProps {
  marketplaces: string[];
  selectedMarketplace: string | null;
  onMarketplaceChange: (marketplace: string | null) => void;
}

export function MarketplaceFilter({
  marketplaces,
  selectedMarketplace,
  onMarketplaceChange
}: MarketplaceFilterProps) {
  return (
    <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-100">
      <div className="flex items-center gap-2 mb-4">
        <Store className="w-5 h-5 text-blue-600" />
        <h2 className="text-lg font-semibold text-gray-800">Filtro de Marketplace</h2>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => onMarketplaceChange(null)}
          className={`px-4 py-2 rounded-lg font-medium transition-all ${
            selectedMarketplace === null
              ? 'bg-blue-600 text-white shadow-md'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          Todos
        </button>
        {marketplaces.map((marketplace) => (
          <button
            key={marketplace}
            onClick={() => onMarketplaceChange(marketplace)}
            className={`px-4 py-2 rounded-lg font-medium transition-all ${
              selectedMarketplace === marketplace
                ? 'bg-blue-600 text-white shadow-md'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {marketplace}
          </button>
        ))}
      </div>
    </div>
  );
}
