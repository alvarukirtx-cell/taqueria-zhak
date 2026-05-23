import { Product } from '../types';

export const INITIAL_PRODUCTS: Product[] = [
  // Tacos
  {
    id: 'taco-pastor',
    name: 'Taco al Pastor',
    category: 'tacos',
    price: 18.00,
    description: 'Carne adobada de cerdo con cebolla, cilantro y piña fresca',
    available: true
  },
  {
    id: 'taco-suadero',
    name: 'Taco de Suadero',
    category: 'tacos',
    price: 18.00,
    description: 'Suadero confitado suave y jugoso con cebolla y cilantro',
    available: true
  },
  {
    id: 'taco-bistec',
    name: 'Taco de Bistec',
    category: 'tacos',
    price: 20.00,
    description: 'Bistec de res jugoso asado a la plancha con cilantro y cebolla',
    available: true
  },
  {
    id: 'taco-campechano',
    name: 'Taco Campechano',
    category: 'tacos',
    price: 22.00,
    description: 'Exquisita mezcla de bistec, suadero y chorizo crujiente',
    available: true
  },
  // Bebidas
  {
    id: 'bebida-cocacola',
    name: 'Coca-Cola',
    category: 'bebidas',
    price: 16.00,
    description: 'Refresco clásico en botella de vidrio de 355ml',
    available: true
  },
  {
    id: 'bebida-sprite',
    name: 'Sprite',
    category: 'bebidas',
    price: 16.00,
    description: 'Refresco sabor lima-limón helado de 355ml',
    available: true
  },
  {
    id: 'bebida-horchata',
    name: 'Agua de Horchata',
    category: 'bebidas',
    price: 20.00,
    description: 'Agua fresca tradicional artesanal de arroz con canela de 1L',
    available: true
  },
  // Extras
  {
    id: 'extra-queso',
    name: 'Queso Extra',
    category: 'extras',
    price: 5.00,
    description: 'Quesito asadero derretido directo a tu taco',
    available: true
  },
  {
    id: 'extra-guacamole',
    name: 'Guacamole Especial',
    category: 'extras',
    price: 15.00,
    description: 'Guacamole fresco hecho al día con aguacate local, tomate y cebolla',
    available: true
  },
  {
    id: 'extra-salsa',
    name: 'Salsa Especial Extra',
    category: 'extras',
    price: 2.00,
    description: 'Porción extra de nuestra salsa habanera o verde súper picante',
    available: true
  },
  // Postres
  {
    id: 'postre-flan',
    name: 'Flan Napolitano',
    category: 'postres',
    price: 25.00,
    description: 'Flan napolitano cremoso bañado en caramelo casero',
    available: true
  },
  {
    id: 'postre-arroz',
    name: 'Arroz con Leche',
    category: 'postres',
    price: 25.00,
    description: 'Clásico postre dulce espolvoreado con canela y pasitas',
    available: true
  }
];
