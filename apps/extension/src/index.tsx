import './styles/style.css';

import React from 'react';
import ReactDOM from 'react-dom/client';

import { ChakraProvider } from '@chakra-ui/react';

import { Extension } from './Extension';
import { chakraTheme } from './theme';

const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(
  <ChakraProvider theme={chakraTheme}>
    <Extension />
  </ChakraProvider>
);